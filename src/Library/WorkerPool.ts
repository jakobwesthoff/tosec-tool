import { Worker } from "worker_threads";

export type WorkComplete<T> = (
  total: number,
  finished: number,
  running: number,
  id: number,
  data: T
) => Promise<void>;

export type WorkError<T> = (
  id: number,
  input: T,
  error: Error
) => Promise<void>;

export type WorkStart<T> = (id: number, data: T) => void;

export type WorkProgress = (id: number, protocol: string, data: any) => void;

export interface WorkerMessage {
  protocol: string;
  data?: any;
}

export class WorkerPool<InputType, OutputType> {
  private inputSetSize: number;
  private finishedCount: number;
  private queue: InputType[];
  private runFinished: () => void;
  private active: boolean;
  private workers: Worker[];
  private freeWorkers: Worker[];
  private workerData: InputType[];

  constructor(
    private poolSize: number,
    private workerFilename: string,
    private complete: WorkComplete<OutputType>,
    private error: WorkError<InputType> = () => Promise.resolve(),
    private start: WorkStart<InputType> = () => Promise.resolve(),
    private progress: WorkProgress = () => {}
  ) {}

  public async initialize(): Promise<void> {
    this.freeWorkers = [];
    this.workers = [];
    await Promise.all(
      // tslint:disable-next-line:prefer-array-literal
      [...Array(this.poolSize).keys()].map((workerIndex: number) =>
        this.spawnWorker(workerIndex)
      )
    );
  }

  public async run(input: InputType[]): Promise<void> {
    this.queue = input;
    this.inputSetSize = input.length;
    this.finishedCount = 0;
    this.active = true;
    this.workerData = [];
    // tslint:disable-next-line:promise-must-complete
    return new Promise<void>((resolve: () => void) => {
      this.runFinished = resolve;
      this.processNextItem();
    });
  }

  public async finalize(): Promise<void> {
    if (this.active) {
      throw new Error(
        `Can not finalize worker pool, while still processing data.`
      );
    }

    await Promise.all(
      // tslint:disable-next-line:prefer-array-literal
      [...Array(this.poolSize).keys()].map((workerIndex: number) =>
        this.terminateWorker(workerIndex)
      )
    );
  }

  private async terminateWorker(workerIndex: number): Promise<void> {
    try {
      await this.workers[workerIndex].terminate();
    } catch (error) {
      // Ignore termination errors for now.
    }
  }

  private spawnWorker(workerIndex: number): Promise<void> {
    return new Promise<void>((resolve: () => void) => {
      const worker = new Worker(this.workerFilename);
      worker.once("message", (message: WorkerMessage) => {
        if (message.protocol !== "ready") {
          throw new Error(
            `First message of Worker was not ready, but ${message.protocol}`
          );
        }

        this.workers[workerIndex] = worker;
        this.freeWorkers[workerIndex] = worker;
        worker.on("message", (message: WorkerMessage) => {
          if (!this.active) {
            return;
          }
          this.handleWorkerMessage(workerIndex, message);
        });
        worker.on("error", (error: Error) => {
          if (!this.active) {
            return;
          }
          this.handleWorkerError(workerIndex, error);
        });
        resolve();
      });
    });
  }

  private async handleWorkerMessage(
    id: number,
    message: WorkerMessage
  ): Promise<void> {
    switch (true) {
      case message.protocol === "error":
        await this.handleWorkerError(id, message.data);
        break;
      case message.protocol === "result":
        await this.complete(
          this.inputSetSize,
          ++this.finishedCount,
          this.poolSize - this.freeWorkers.length,
          id,
          message.data
        );
        this.freeWorkers.push(this.workers[id]);
        this.processNextItem();
        break;
      case message.protocol.startsWith("progress-"):
        this.progress(id, message.protocol, message.data);
        break;
      default:
        throw new Error(`Unknown Worker message: ${message.protocol}`);
    }
  }

  private async handleWorkerError(
    id: number,
    error: Error | string
  ): Promise<void> {
    const errorObj =
      error instanceof Error
        ? error
        : new Error(error.split(/\r\n|\r|\n/).shift());
    await this.error(id, this.workerData[id], errorObj);
    await this.workers[id].terminate();
    await this.spawnWorker(id);
    this.processNextItem();
  }

  private processNextItem(): void {
    if (this.queue.length === 0 && this.freeWorkers.length === this.poolSize) {
      this.active = false;
      this.runFinished();
      this.runFinished = undefined;
      return;
    }

    if (this.freeWorkers.length === 0) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const worker = this.freeWorkers.pop();
    const workerData = this.queue.shift();
    const workerId = this.workers.findIndex(
      (candidate: Worker) => candidate === worker
    );
    this.workerData[workerId] = workerData;
    this.start(workerId, workerData);
    worker.postMessage({
      protocol: "execute",
      data: workerData
    });

    this.processNextItem();
  }
}

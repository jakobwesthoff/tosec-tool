import { Worker } from "worker_threads";

export type WorkComplete<T> = (
  total: number,
  finished: number,
  running: number,
  id: number,
  data: T
) => Promise<void>;

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

  constructor(
    private poolSize: number,
    private workerFilename: string,
    private complete: WorkComplete<OutputType>,
    private progress: WorkProgress = () => {}
  ) {}

  public initialize(): Promise<void> {
    // tslint:disable-next-line:promise-must-complete
    return new Promise<void>((resolve: () => void) => {
      let spawningWorkers = this.poolSize;
      this.freeWorkers = [];
      this.workers = [];
      for (let i = 0; i < this.poolSize; i++) {
        ((workerIndex: number) => {
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

            spawningWorkers--;
            if (spawningWorkers === 0) {
              resolve();
            }
          });
        })(i);
      }
    });
  }

  public async run(input: InputType[]): Promise<void> {
    this.queue = input;
    this.inputSetSize = input.length;
    this.finishedCount = 0;
    this.active = true;
    // tslint:disable-next-line:promise-must-complete
    return new Promise<void>((resolve: () => void) => {
      this.runFinished = resolve;
      this.processNextItem();
    });
  }

  private async handleWorkerMessage(
    id: number,
    message: WorkerMessage
  ): Promise<void> {
    switch (true) {
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
    worker.postMessage({
      protocol: "index-dat-file",
      data: this.queue.shift()
    });

    this.processNextItem();
  }
}

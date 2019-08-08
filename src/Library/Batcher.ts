export type Executor<InputType, OutputType> = (
  input: InputType
) => Promise<OutputType>;

export type BatchUpdate = (
  total: number,
  finished: number,
  waiting: number
) => void;

export class Batcher<InputType, OutputType> {
  private inputSetSize: number;
  private queue: InputType[];
  private queueIndex: number;
  private resultSet: OutputType[];
  private waiting: number;
  private runFinished: (result: OutputType[]) => void;
  private runFailed: (reason: Error) => void;
  private running: boolean;

  constructor(
    private batchSize: number,
    private executor: Executor<InputType, OutputType>,
    private batchUpdate: BatchUpdate = () => {}
  ) {}

  public async run(input: InputType[]): Promise<OutputType[]> {
    this.queue = input;
    this.inputSetSize = input.length;
    this.queueIndex = 0;
    this.waiting = 0;
    this.resultSet = [];
    this.running = true;
    // tslint:disable-next-line:promise-must-complete
    return new Promise<OutputType[]>(
      (
        resolve: (result: OutputType[]) => void,
        reject: (reason?: Error) => void
      ) => {
        this.runFinished = resolve;
        this.runFailed = reject;

        this.processNextItem();
      }
    );
  }

  private processNextItem(): void {
    this.batchUpdate(this.inputSetSize, this.resultSet.length, this.waiting);

    if (this.queue.length === 0 && this.waiting === 0) {
      this.running = false;
      this.runFinished(this.resultSet);
      this.runFinished = undefined;
      this.runFailed = undefined;
      this.resultSet = undefined;
      return;
    }

    if (this.waiting >= this.batchSize) {
      return;
    }

    const createResultStorageCallback = (storageIndex: number) => (
      result: OutputType
    ) => {
      if (!this.running) {
        return;
      }

      this.resultSet[storageIndex] = result;
      this.waiting--;
      this.processNextItem();
    };

    this.executor(this.queue.shift())
      .catch((error: Error) => {
        if (!this.running) {
          return;
        }

        this.running = false;
        this.runFailed(error);
        this.runFinished = undefined;
        this.runFailed = undefined;
        this.resultSet = undefined;
      })
      .then(createResultStorageCallback(this.queueIndex++));

    this.waiting++;

    this.processNextItem();
  }
}

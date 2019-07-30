import { ITask } from "./ITask";
import { SymbolMap, TaskUpdate } from "./TaskList";

export enum SimpleTaskState {
  RUNNING,
  FINISHED
}

export class SimpleTask implements ITask {
  private state: SimpleTaskState;

  constructor(private description: string) {
    this.state = SimpleTaskState.RUNNING;
  }

  public update(state: SimpleTaskState, description: string | null) {
    this.state = state;
    this.description = description;
  }

  public finish(): void {
    this.state = SimpleTaskState.FINISHED;
  }

  public hasFinished(): boolean {
    return this.state === SimpleTaskState.FINISHED;
  }

  public createUpdateFn(): TaskUpdate {
    return (description: string) =>
      this.update(SimpleTaskState.RUNNING, description);
  }

  public render(symbols: SymbolMap): string | undefined {
    if (this.description === null) {
      return undefined;
    } else if (this.state === SimpleTaskState.FINISHED) {
      return `${symbols.success} ${this.description}`;
    } else {
      return `${symbols.spinner}${this.description}`;
    }
  }
}

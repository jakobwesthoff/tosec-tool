import { ITask } from "./ITask";
import { SymbolMap, TaskUpdate } from "./TaskList";

export class StaticInfoTask implements ITask {
  constructor(private description: string) {}

  public update() {}

  public finish(): void {}

  public hasFinished(): boolean {
    return true;
  }

  public createUpdateFn(): TaskUpdate {
    return () => {};
  }

  public render(symbols: SymbolMap): string | undefined {
    return `${symbols.info} ${this.description}`;
  }
}

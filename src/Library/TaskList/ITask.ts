import { SymbolMap, TaskUpdate } from "./TaskList";

export interface ITask {
  update(...args: any[]): void;
  finish(): void;
  hasFinished(): boolean;

  render(symbols: SymbolMap): string | undefined;

  createUpdateFn(): TaskUpdate;
}

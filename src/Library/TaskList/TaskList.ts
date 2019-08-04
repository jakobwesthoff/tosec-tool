import chalk from "chalk";
import { LogUpdate } from "log-update";
import { Ora } from "ora";
import { ITask } from "./ITask";
import logSymbols = require("log-symbols");
import logUpdate = require("log-update");
import ora = require("ora");
import Timeout = NodeJS.Timeout;

export interface TaskUpdate {
  (...args: any[]): void;
}

export interface SymbolMap {
  spinner: string;
  success: string;
  error: string;
  info: string;
  warning: string;
}

export class TaskList {
  private tasks: ITask[];
  private logUpdate: LogUpdate;
  private timeout: Timeout | undefined;
  private ora: Ora;

  constructor() {
    this.tasks = [];
    this.logUpdate = logUpdate;
    this.ora = ora();
  }

  public addTask(task: ITask, relativePosition: number = 0) {
    if (relativePosition > 0) {
      relativePosition = 0;
    }

    if (relativePosition < this.tasks.length * -1) {
      relativePosition = this.tasks.length * -1;
    }

    this.tasks.splice(this.tasks.length + relativePosition, 0, task);
  }

  public async withTask<T>(
    task: ITask,
    executor: (update: TaskUpdate) => Promise<T>
  ): Promise<T> {
    this.addTask(task);
    const returnValue = await executor(task.createUpdateFn());
    task.finish();
    return returnValue;
  }

  public start(): void {
    if (this.timeout) {
      this.stop();
    }

    this.timeout = setInterval(() => this.render(), 50);
  }

  public stop(): void {
    if (this.timeout) {
      clearInterval(this.timeout);
      this.timeout = undefined;
    }
    this.render();
  }

  private cleanupTasks() {
    const finishedTasks = [];
    while (this.tasks.length > 0 && this.tasks[0].hasFinished()) {
      finishedTasks.push(this.tasks.shift());
    }

    if (finishedTasks.length > 0) {
      const symbols = this.createSymbolMap();
      const output = finishedTasks
        .map((task: ITask) => task.render(symbols))
        .filter((line: string | undefined) => line !== undefined)
        .join("\n");
      this.logUpdate(output);
      this.logUpdate.done();
    }
  }

  private render() {
    this.cleanupTasks();

    const symbols = this.createSymbolMap();
    const output = this.tasks
      .map((task: ITask) => task.render(symbols))
      .filter((line: string | undefined) => line !== undefined)
      .join("\n");
    this.logUpdate(output);
  }

  private createSymbolMap(): SymbolMap {
    return { spinner: chalk.grey(this.ora.frame() as any), ...logSymbols };
  }
}

import chalk from "chalk";
import { LogUpdate } from "log-update";
import { Ora } from "ora";
import { Task, TaskState } from "./Task";
import logSymbols = require("log-symbols");
import logUpdate = require("log-update");
import ora = require("ora");
import Timeout = NodeJS.Timeout;

export type TaskRendererUpdate = (description: string) => void;

export class TaskRenderer {
  private tasks: Task[];
  private ora: Ora;
  private logUpdate: LogUpdate;
  private timeout: Timeout | undefined;

  constructor() {
    this.tasks = [];
    this.ora = ora();
    this.logUpdate = logUpdate;
  }

  public createTask(description: string): Task {
    const task = new Task(description);
    this.tasks.push(task);
    this.render();
    return task;
  }

  public async withTask<T>(
    description: string,
    executor: (update: TaskRendererUpdate) => Promise<T>
  ): Promise<T> {
    const task = this.createTask(description);
    const returnValue = await executor((newDescription: string) =>
      task.update(TaskState.RUNNING, newDescription)
    );
    task.update(TaskState.FINISHED, task.getDescription());
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
    while (
      this.tasks.length > 0 &&
      this.tasks[0].getState() === TaskState.FINISHED
    ) {
      finishedTasks.push(this.tasks.shift());
    }

    if (finishedTasks.length > 0) {
      const output = finishedTasks
        .map((task: Task) => `${logSymbols.success} ${task.getDescription()}`)
        .join("\n");
      this.logUpdate(output);
      this.logUpdate.done();
    }
  }

  private render() {
    this.cleanupTasks();

    const output = this.tasks
      .map(
        (task: Task) =>
          `${chalk.gray(this.ora.frame() as any)}${task.getDescription()}`
      )
      .join("\n");
    this.logUpdate(output);
  }
}

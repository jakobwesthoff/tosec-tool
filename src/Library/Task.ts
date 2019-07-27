export enum TaskState {
  RUNNING,
  FINISHED
}

export class Task {
  private state: TaskState;

  constructor(private description: string) {
    this.state = TaskState.RUNNING;
  }

  update(state: TaskState, description: string) {
    this.state = state;
    this.description = description;
  }

  getState(): TaskState {
    return this.state;
  }

  getDescription(): string {
    return this.description;
  }
}

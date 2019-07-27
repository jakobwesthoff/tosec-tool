export enum TaskState {
  RUNNING,
  FINISHED
}

export class Task {
  private state: TaskState;
  private disabled: boolean;

  constructor(private description: string) {
    this.disabled = false;
    this.state = TaskState.RUNNING;
  }

  update(state: TaskState, description: string | null) {
    this.state = state;
    this.disabled = description === null;
    this.description = description;
  }

  getState(): TaskState {
    return this.state;
  }

  getDescription(): string {
    return this.description;
  }

  isDisabled(): boolean {
    return this.disabled;
  }
}

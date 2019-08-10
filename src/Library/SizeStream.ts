import { PassThrough, TransformOptions } from "stream";

export class SizeStream extends PassThrough {
  private size: number;

  constructor(opts?: TransformOptions) {
    super(opts);
    this.size = 0;

    this.on("data", (data: Buffer) => (this.size = this.size + data.length));
  }

  public getSize(): number {
    return this.size;
  }
}

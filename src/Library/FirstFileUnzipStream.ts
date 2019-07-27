import { createReadStream } from "fs";
import { PassThrough } from "stream";
import * as unzip from "unzip-stream";

export class FirstFileUnzipStream extends PassThrough {
  private firstFileStreamed: boolean;

  constructor(filepath: string) {
    super();
    this.firstFileStreamed = false;
    createReadStream(filepath)
      .pipe(unzip.Parse())
      .on("entry", (entry: any) => {
        if (!this.firstFileStreamed && entry.type === "File") {
          entry.pipe(this);
          this.firstFileStreamed = true;
        } else {
          entry.autodrain();
        }
      });
  }
}

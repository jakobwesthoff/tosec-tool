import { crc32 } from "crc";
import { Duplex, DuplexOptions } from "stream";

export class CrcStream extends Duplex {
  private lastValue: number;

  constructor(options?: DuplexOptions) {
    super({...options, encoding: "utf8"});
  }

  // tslint:disable-next-line:function-name
  public _write(
    chunk: any,
    _encoding: string,
    callback: (error?: Error | null) => void
  ): void {
    if (this.lastValue !== undefined) {
      this.lastValue = crc32(chunk, this.lastValue);
    } else {
      this.lastValue = crc32(chunk);
    }
    callback();
  }

  // tslint:disable-next-line:function-name
  public _read(_size: number): void {
    if (this.lastValue !== undefined) {
      this.push(this.lastValue.toString(16).padStart(8, '0'), 'utf8');
    }
    else {
      this.push(crc32('').toString(16).padStart(8, '0'), 'utf8');
    }
  }
}

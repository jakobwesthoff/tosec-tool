import {FileTypeResult} from 'file-type';
import * as fileType from 'file-type';
import { extname } from "path";
import readChunk = require("read-chunk");

export class MimeTypeResolver {
  constructor() {}

  public async resolve(filePath: string): Promise<FileTypeResult> {
    const chunkOfFile = await readChunk(filePath, 0, fileType.minimumBytes);
    const fileTypeInfo = fileType(chunkOfFile);

    if (fileTypeInfo === undefined) {
      return {
        ext: extname(filePath).substr(1) as any, // Essentially we are cheating here type wise.
        mime: "application/octet-stream"
      };
    } else {
      return fileTypeInfo;
    }
  }
}

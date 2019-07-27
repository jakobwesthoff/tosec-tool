import { createHash, Hash } from "crypto";
import { Readable } from "stream";
import { CrcStream } from "./CrcStream";

export interface HashedFile {
  sha1: string;
  md5: string;
  crc32: string;
}

export class HashGenerator {
  public async hash(fileStream: Readable): Promise<HashedFile> {
    const [sha1, md5, crc32] = await this.hashStream(
      ["sha1", "md5", "crc32"],
      fileStream
    );
    return { sha1, md5, crc32 };
  }

  private createHashStream(algorithm: string): Hash | CrcStream {
    if (algorithm === "crc32") {
      return new CrcStream();
    } else {
      const stream = createHash(algorithm);
      stream.setEncoding("hex");
      return stream;
    }
  }

  private async pipeToHashStream(
    inputStream: Readable,
    algorithm: string
  ): Promise<string> {
    return new Promise<string>(
      (resolve: (value: string) => void, reject: (reason?: any) => void) => {
        const hashStream = this.createHashStream(algorithm);
        inputStream.pipe(hashStream).on("error", reject);
        hashStream.on("finish", () => resolve(hashStream.read()));
      }
    );
  }

  private async hashStream(
    algorithms: string[],
    inputStream: Readable
  ): Promise<string[]> {
    return new Promise<string[]>(
      async (
        resolve: (value: string[]) => void,
        reject: (reason?: any) => void
      ) => {
        inputStream.on("error", reject);

        try {
          const hashes = await Promise.all(
            algorithms.map((algorithm: string) =>
              this.pipeToHashStream(inputStream, algorithm)
            )
          );
          resolve(hashes);
        } catch (error) {
          reject(error);
        }
      }
    );
  }
}

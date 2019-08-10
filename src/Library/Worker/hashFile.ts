import { createReadStream } from "fs";
import { Readable } from "stream";
import * as unzipper from "unzipper";
import { isMainThread, parentPort } from "worker_threads";
import { HashedFile, HashGenerator } from "../HashGenerator";
import { SizeStream } from "../SizeStream";
import { WorkerMessage } from "../WorkerPool";

export interface Result {
  filepath: string;
  hashes: HashedFile;
  size: number;
}

if (isMainThread) {
  throw new Error(`This script should only be loaded in a worker environment`);
}

const hashGenerator = new HashGenerator();

parentPort.on(
  "message",
  ({ protocol, data: { filepath, mimetype } }: WorkerMessage) => {
    if (protocol !== "execute") {
      throw new Error(`Unknown Protocol: ${protocol}`);
    }

    hashFile(filepath, mimetype);
  }
);

function createReadableForFile(filepath: string, mimetype: string): Readable {
  const readStream = createReadStream(filepath, { autoClose: true });
  if (mimetype === "application/zip") {
    return readStream.pipe(unzipper.ParseOne(undefined, undefined));
  } else {
    return readStream;
  }
}

async function hashFile(filepath: string, mimetype: string): Promise<void> {
  const fileStream = createReadableForFile(filepath, mimetype);
  const sizeStream = new SizeStream();
  fileStream.pipe(sizeStream);
  let hashes;
  try {
    hashes = await hashGenerator.hash(sizeStream);
    parentPort.postMessage({
      protocol: "result",
      data: { filepath, hashes, size: sizeStream.getSize() }
    });
  } catch (error) {
    parentPort.postMessage({ protocol: "error", data: error });
  }
}

parentPort.postMessage({ protocol: "ready" });

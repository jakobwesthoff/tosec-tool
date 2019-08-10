import { spawn } from "child_process";
import { basename } from "path";
import { isMainThread, parentPort } from "worker_threads";
import { RetroarchRdbFile, RetroarchRom } from "../DataStorage";
import { WorkerMessage } from "../WorkerPool";

export interface Result {
  filepath: string;
  data: ReadData;
}

export interface ReadData {
  rdbs: RetroarchRdbFile[];
  roms: RetroarchRom[];
}

export interface Input {
  filepath: string;
  libretrodbToolPath: string;
}

if (isMainThread) {
  throw new Error(`This script should only be loaded in a worker environment`);
}

parentPort.on(
  "message",
  ({ protocol, data: { filepath, libretrodbToolPath } }: WorkerMessage) => {
    if (protocol !== "execute") {
      throw new Error(`Unknown Protocol: ${protocol}`);
    }

    indexRdbFile(libretrodbToolPath, filepath);
  }
);

// const w = fs.createWriteStream("./entries.log");

async function indexRdbFile(
  libretrodbToolPath: string,
  filepath: string
): Promise<void> {
  const results: ReadData = { rdbs: [], roms: [] };

  results.rdbs.push({ filepath, name: basename(filepath, ".rdb") });

  const entries = await listRdbAsJson(libretrodbToolPath, filepath);

  entries
    .filter((candidate: any, _: number) => {
      if (candidate.name && candidate.crc && candidate.sha1 && candidate.md5) {
        return true;
      } else {
        // w.write(`${filepath}, ${index}: ${JSON.stringify(candidate)}\n`);
        return false;
      }
    })
    .forEach((entry: any) => {
      results.roms.push({
        rdbid: 0,
        name: entry.name,
        crc32: entry.crc,
        sha1: entry.sha1,
        md5: entry.md5
      });
    });

  parentPort.postMessage({
    protocol: "result",
    data: { filepath, data: results }
  });
}

async function listRdbAsJson(
  libretrodbToolPath: string,
  filepath: string
): Promise<any[]> {
  return new Promise<any[]>(
    (resolve: (value?: any[]) => void, reject: (reason: Error) => void) => {
      const tool = spawn(libretrodbToolPath, [filepath, "list"]);
      let stdout = Buffer.from("");
      let stderr = Buffer.from("");
      tool.stdout.on(
        "data",
        (data: Buffer) => (stdout = Buffer.concat([stdout, data]))
      );
      tool.stderr.on(
        "data",
        (data: Buffer) => (stderr = Buffer.concat([stderr, data]))
      );
      tool.on("close", (code: number) => {
        if ((code !== 0 && code !== 1) || stderr.toString("utf-8") !== "") {
          // the tool usually exists with code 1 :(
          reject(
            new Error(
              `libretrodb_tool exited with non zero exit code or printed to stderr: ${code}\n${stderr.toString(
                "utf-8"
              )}`
            )
          );
        } else {
          const jsonData = stdout.toString("utf-8");
          resolve(
            jsonData
              .split(/\r\n|\r|\n/)
              .filter((candidate: string) => candidate.trim() !== "")
              .map((jsonDocument: string, _: number) => {
                try {
                  return JSON.parse(jsonDocument);
                } catch (error) {
                  // w.write(`ERROR: ${filepath}, ${index}: ${jsonDocument}\n`);
                  return undefined;
                }
              })
              .filter((candidate: any) => candidate !== undefined)
          );
        }
      });
    }
  );
}

parentPort.postMessage({ protocol: "ready" });

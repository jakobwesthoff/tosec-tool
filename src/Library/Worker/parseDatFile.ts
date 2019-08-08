import * as fs from "fs";
import { basename } from "path";
import { isMainThread, parentPort } from "worker_threads";
import { DatFile, TosecGame, TosecRom } from "../DataStorage";
import { TosecDatParser } from "../TosecDatParser";
import { WorkerMessage } from "../WorkerPool";

export interface Result {
  filepath: string;
  data: ParsedData;
}

export interface ParsedData {
  datFile: DatFile[];
  games: TosecGame[];
  roms: TosecRom[];
}

if (isMainThread) {
  throw new Error(`This script should only be loaded in a worker environment`);
}

const parser = new TosecDatParser();

parentPort.on("message", ({ protocol, data: filepath }: WorkerMessage) => {
  if (protocol !== "index-dat-file") {
    throw new Error(`Unknown Protocol: ${protocol}`);
  }

  indexDatFile(filepath);
});

async function indexDatFile(filepath: string): Promise<void> {
  const datfile = basename(filepath);
  // tslint:disable-next-line:non-literal-fs-path
  const fileStream = fs.createReadStream(filepath);

  const results: any = {
    datFile: [],
    games: [],
    roms: []
  };

  let datid: number;
  let gameid: number;
  let romCount: number = 0;

  await parser.parse(fileStream, {
    datFile: (datFile: DatFile) => {
      results.datFile.push({
        description: null,
        author: null,
        email: null,
        homepage: null,
        url: null,
        ...datFile,
        filepath
      });
      datid = results.datFile.length - 1;
    },
    game: (game: TosecGame) => {
      results.games.push({
        ...game,
        datid
      });
      gameid = results.games.length - 1;
    },
    rom: (rom: TosecRom) => {
      if (
        rom.crc32 !== undefined &&
        rom.sha1 !== undefined &&
        rom.md5 !== undefined
      ) {
        results.roms.push({
          ...rom,
          gameid
        });
        parentPort.postMessage({
          protocol: "progress-rom-analysed",
          data: `Analysing roms from ${datfile} (${++romCount})...`
        });
      }
    }
  });

  parentPort.postMessage({
    protocol: "result",
    data: { filepath, data: results }
  });
}

parentPort.postMessage({ protocol: "ready" });

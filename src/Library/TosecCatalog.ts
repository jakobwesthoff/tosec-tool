import * as fs from "fs";
import { basename } from "path";
import * as readdirp from "readdirp";
import { DataStorage, DatFile, TosecGame, TosecRom } from "./DataStorage";
import { EntryInfo } from "./EntryInfo";
import { ICatalog } from "./ICatalog";
import { SimpleTask } from "./TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";
import { TosecDatParser } from "./TosecDatParser";

export class TosecCatalog implements ICatalog {
  constructor(
    private datasetDirectory: string,
    private taskList: TaskList,
    private storage: DataStorage,
    private parser: TosecDatParser
  ) {}

  public async createIndex(): Promise<void> {
    let entries = (await this.getDatFileList()).filter(
      (entry: EntryInfo) => !this.storage.isDatFileAlreadyKnown(entry.fullPath)
    );
    await this.indexDatset(entries);
  }

  private async getDatFileList(): Promise<EntryInfo[]> {
    return await this.taskList.withTask(
      new SimpleTask("Scanning datsets..."),
      async (update: TaskUpdate) => {
        const entries = await readdirp.promise(this.datasetDirectory, {
          type: "files",
          fileFilter: "*.dat"
        });
        update(`Scanned ${entries.length} datasets.`);
        return entries;
      }
    );
  }

  private async indexDatset(entries: EntryInfo[]): Promise<void> {
    const numberOfDats = entries.length;
    await this.taskList.withTask(
      new SimpleTask(`Parsing ${numberOfDats} datsets...`),
      async (update: TaskUpdate) => {
        let iteration = 0;
        for (const { fullPath: filepath } of entries) {
          await this.indexDatFile(filepath);
          update(`Parsing datsets (${++iteration} / ${numberOfDats})...`);
        }
        update(`Parsed ${iteration} datsets.`);
      }
    );
  }

  private async indexDatFile(filepath: string): Promise<void> {
    const datfile = basename(filepath);
    await this.taskList.withTask(
      new SimpleTask(`Analysing roms from ${datfile}...`),
      async (update: TaskUpdate) => {
        // tslint:disable-next-line:non-literal-fs-path
        const fileStream = fs.createReadStream(filepath);
        let datid: number;
        let gameid: number;
        let gameCount = 0;

        await this.parser.parse(fileStream, {
          datFile: (datFile: DatFile) => {
            datid = this.storage.storeDatFile({
              description: null,
              author: null,
              email: null,
              homepage: null,
              url: null,
              ...datFile,
              filepath
            });
          },
          game: (game: TosecGame) => {
            gameid = this.storage.storeTosecGame({
              ...game,
              datid
            });
          },
          rom: (rom: TosecRom) => {
            if (
              rom.crc32 !== undefined &&
              rom.sha1 !== undefined &&
              rom.md5 !== undefined
            ) {
              this.storage.storeTosecRom({
                ...rom,
                gameid
              });
              update(`Analysing roms from ${datfile} (${++gameCount})...`);
            }
          }
        });
        update(null);
      }
    );
  }
}

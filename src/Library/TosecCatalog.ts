import * as fs from "fs";
import { basename } from "path";
import * as readdirp from "readdirp";
import { DataStorage, DatFile, TosecGame, TosecRom } from "./DataStorage";
import { EntryInfo } from "./EntryInfo";
import { ICatalog } from "./ICatalog";
import { TaskRenderer, TaskRendererUpdate } from "./TaskRenderer";
import { TosecDatParser } from "./TosecDatParser";

export class TosecCatalog implements ICatalog {
  constructor(
    private datasetDirectory: string,
    private renderer: TaskRenderer,
    private storage: DataStorage,
    private parser: TosecDatParser
  ) {}

  public async createIndex(): Promise<void> {
    const entries = await this.getDatFileList();
    await this.indexDatset(entries);
  }

  private async getDatFileList(): Promise<EntryInfo[]> {
    return await this.renderer.withTask(
      "Scanning datsets...",
      async (update: TaskRendererUpdate) => {
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
    await this.renderer.withTask(
      `Loading ${numberOfDats} datsets...`,
      async (update: TaskRendererUpdate) => {
        let iteration = 0;
        for (const { fullPath: filepath } of entries) {
          await this.indexDatFile(filepath);
          update(`Loading datsets (${++iteration} / ${numberOfDats})...`);
        }
        update(`Loaded ${iteration} datsets.`);
      }
    );
  }

  private async indexDatFile(filepath: string): Promise<void> {
    const datfile = basename(filepath);
    await this.renderer.withTask(
      `Analysing roms from ${datfile}...`,
      async (update: TaskRendererUpdate) => {
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

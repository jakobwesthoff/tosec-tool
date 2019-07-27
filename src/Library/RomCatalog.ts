import * as fs from "fs";
import * as readdirp from "readdirp";
import { DataStorage } from "./DataStorage";
import { HashGenerator } from "./HashGenerator";
import { MimeTypeResolver } from "./MimeTypeResolver";
import { TaskRenderer, TaskRendererUpdate } from "./TaskRenderer";

// Datatype returned by readdirp
interface EntryInfo {
  path: string;
  fullPath: string;
  basename: string;
  stats?: fs.Stats;
  dirent?: fs.Dirent;
}

export class RomCatalog {
  constructor(
    private filepath: string,
    private renderer: TaskRenderer,
    private storage: DataStorage,
    private mimeTypeResolver: MimeTypeResolver,
    private hashGenerator: HashGenerator
  ) {}

  public async createIndex(): Promise<void> {
    let entries = await this.getRomListEntries(this.filepath);
    await this.analyseRomEntries(entries);
    entries = undefined; // Allow GC to cleanup possibly large list of file entries
    await this.updateRomHashes();
  }

  private async getRomListEntries(filepath: string) {
    return await this.renderer.withTask(
      "Scanning files ...",
      async (update: TaskRendererUpdate) => {
        const entries = await readdirp.promise(filepath, {
          type: "files"
        });
        update(`Scanned ${entries.length} files.`);
        return entries;
      }
    );
  }

  private async analyseRomEntries(entries: EntryInfo[]) {
    await this.renderer.withTask(
      "Analysing roms...",
      async (update: TaskRendererUpdate) => {
        const numberOfFiles = entries.length;
        for (let i = 0; i < numberOfFiles; i++) {
          const entry = entries[i];

          const fileType = await this.mimeTypeResolver.resolve(entry.fullPath);

          await this.storage.storeRom({
            filepath: entry.fullPath,
            sha1: null,
            md5: null,
            crc32: null,
            extension: fileType.ext,
            mimetype: fileType.mime
          });
          update(`Analysing Roms (${i} / ${numberOfFiles})...`);
        }

        const count = await this.storage.getNumberOfRoms();
        update(`Analysed ${count} files.`);
        return count;
      }
    );
  }

  private async updateRomHashes() {
    const count = await this.storage.getNumberOfRomsWithoutHashes();
    await this.renderer.withTask(
      `Hashing files (0 / ${count})...`,
      async (update: TaskRendererUpdate) => {
        /*
         * This way of iteration in chunks is not really efficient, but is due
         * to constraints in better-sqlite not possible in other way, without
         * loading the whole file list into ram.
         *
         * See: https://github.com/JoshuaWise/better-sqlite3/issues/203
         */

        let iteration = 0;
        // tslint:disable-next-line:no-constant-condition
        while (true) {
          const rows = await this.storage.getRomsWithoutHashes();
          if (rows.length === 0) {
            break;
          }

          for (const { filepath } of rows) {
            const hashes = await this.hashGenerator.hash(filepath);
            await this.storage.storeHashesForRom(hashes);
            update(`Hashing files (${++iteration} / ${count})...`);
          }
        }
        update(`Hashed ${iteration} files.`);
      }
    );
  }
}

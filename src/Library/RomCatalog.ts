import { createReadStream } from "fs";
import { filterSeries } from "p-iteration";
import { basename } from "path";
import * as readdirp from "readdirp";
import { Readable } from "stream";
import { DataStorage } from "./DataStorage";
import { EntryInfo } from "./EntryInfo";
import { exists } from "./FileAccess";
import { FirstFileUnzipStream } from "./FirstFileUnzipStream";
import { HashGenerator } from "./HashGenerator";
import { ICatalog } from "./ICatalog";
import { MimeTypeResolver } from "./MimeTypeResolver";
import { SimpleTask } from "./TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";

export class RomCatalog implements ICatalog {
  constructor(
    private filepaths: string[],
    private taskList: TaskList,
    private storage: DataStorage,
    private mimeTypeResolver: MimeTypeResolver,
    private hashGenerator: HashGenerator
  ) {}

  public async createIndex(): Promise<void> {
    await this.cleanupRemovedFiles();
    let entries = (await this.getRomListEntries(this.filepaths)).filter(
      (entry: EntryInfo) => !this.storage.isRomAlreadyKnown(entry.fullPath)
    );
    await this.analyseRomEntries(entries);
    entries = undefined; // Allow GC to cleanup possibly large list of file entries
    await this.updateRomHashes();
  }

  private async cleanupRemovedFiles(): Promise<void> {
    await this.taskList.withTask(
      new SimpleTask(`Validating rom file database...`),
      async (update: TaskUpdate) => {
        const storedRomFiles = await this.storage.getRomFilepaths();
        let iteration = 0;
        const removedRomFiles = await filterSeries(
          storedRomFiles,
          async (filepath: string) => {
            update(
              `Validating loaded rom file database (${++iteration} / ${
                storedRomFiles.length
              })...`
            );

            return !(await exists(filepath));
          }
        );

        for (let i = 0; i < removedRomFiles.length; i++) {
          update(
            `Removing no longer existing rom from db (${i + 1} / ${
              removedRomFiles.length
            })...`
          );
          await new Promise<void>(
            (resolve: (value?: PromiseLike<void> | void) => void) =>
              setImmediate(async () => {
                await this.storage.removeRomFile(removedRomFiles[i]);
                resolve();
              })
          );
        }
        update(`Validated rom file database.`);
      }
    );
  }

  private async getRomListEntries(filepaths: string[]): Promise<EntryInfo[]> {
    return await this.taskList.withTask(
      new SimpleTask("Scanning roms..."),
      async (update: TaskUpdate) => {
        let combinedEntries = [];
        for (const filepath of filepaths) {
          update(`Scanning roms from ${filepath}`);
          const entries = await readdirp.promise(filepath, {
            type: "files"
          });
          combinedEntries = combinedEntries.concat(entries);
        }
        update(`Scanned ${combinedEntries.length} roms.`);
        return combinedEntries;
      }
    );
  }

  private async analyseRomEntries(entries: EntryInfo[]) {
    await this.taskList.withTask(
      new SimpleTask("Analysing roms..."),
      async (update: TaskUpdate) => {
        const numberOfFiles = entries.length;
        for (let i = 0; i < numberOfFiles; i++) {
          const entry = entries[i];

          const fileType = await this.mimeTypeResolver.resolve(entry.fullPath);

          this.storage.storeRomFile({
            filepath: entry.fullPath,
            sha1: null,
            md5: null,
            crc32: null,
            extension: fileType.ext,
            mimetype: fileType.mime
          });
          update(`Analysing rom (${i} / ${numberOfFiles}): ${entry.basename}`);
        }

        update(`Analysed ${numberOfFiles} roms.`);
      }
    );
  }

  private async updateRomHashes() {
    const count = this.storage.getNumberOfRomsWithoutHashes();
    await this.taskList.withTask(
      new SimpleTask(`Hashing roms (0 / ${count})...`),
      async (update: TaskUpdate) => {
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
          const rows = this.storage.getRomsWithoutHashes();
          if (rows.length === 0) {
            break;
          }

          for (const { filepath, mimetype } of rows) {
            const fileStream = this.createReadableForFile(filepath, mimetype);
            const hashes = await this.hashGenerator.hash(fileStream);
            this.storage.storeHashesForRom(filepath, hashes);
            update(
              `Hashing roms (${++iteration} / ${count}): ${basename(filepath)}`
            );
          }
        }
        update(`Hashed ${iteration} roms.`);
      }
    );
  }

  private createReadableForFile(filepath: string, mimetype: string): Readable {
    if (mimetype === "application/zip") {
      return new FirstFileUnzipStream(filepath);
    } else {
      return createReadStream(filepath, { autoClose: true });
    }
  }
}

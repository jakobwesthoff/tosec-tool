import { filterSeries } from "p-iteration";
import { basename } from "path";
import * as readdirp from "readdirp";
import { DataStorage, RomFile } from "./DataStorage";
import { EntryInfo } from "./EntryInfo";
import { exists } from "./FileAccess";
import { ICatalog } from "./ICatalog";
import { MimeTypeResolver } from "./MimeTypeResolver";
import { SimpleTask, SimpleTaskState } from "./TaskList/SimpleTask";
import { StaticWarningTask } from "./TaskList/StaticWarningTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";
import { Result } from "./Worker/hashFile";
import { WorkerPool } from "./WorkerPool";

export class RomCatalog implements ICatalog {
  constructor(
    private filepaths: string[],
    private taskList: TaskList,
    private storage: DataStorage,
    private mimeTypeResolver: MimeTypeResolver
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

  public async cleanupRemovedFiles(): Promise<void> {
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
            (
              resolve: (value?: PromiseLike<void> | void) => void,
              reject: (reason?: any) => void
            ) =>
              setImmediate(async () => {
                try {
                  await this.storage.removeRomFile(removedRomFiles[i]);
                  resolve();
                } catch (error) {
                  reject(error);
                }
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
      new SimpleTask("Analysing new roms..."),
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
            size: null,
            extension: fileType.ext,
            mimetype: fileType.mime
          });
          update(
            `Analysing new rom (${i} / ${numberOfFiles}): ${entry.basename}`
          );
        }

        update(`Analysed ${numberOfFiles} new roms.`);
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

        let hashedFileCount = 0;
        const poolSize = 4;
        const tasks: SimpleTask[] = [];
        for (let i = 0; i < poolSize; i++) {
          tasks[i] = new SimpleTask(`Waiting to hash file...`);
          this.taskList.addTask(tasks[i]);
        }

        const pool = new WorkerPool<any, Result>(
          poolSize,
          `${__dirname}/Worker/hashFile.js`,
          async (
            _: number,
            __: number,
            ___: number,
            id: number,
            result: Result
          ) => {
            this.storage.storeHashesForRom(result.filepath, result.hashes);
            this.storage.storeSizeForRom(result.filepath, result.size);
            update(`Hashing roms (${++hashedFileCount} / ${count})...`);
            tasks[id].update(
              SimpleTaskState.RUNNING,
              `Waiting to hash file...`
            );
          },
          async (_: number, { filepath }: any, error: Error) => {
            this.storage.storeCorruptionForRom(filepath, error.message);
            this.taskList.addTask(
              new StaticWarningTask(
                `Could not hash file ${filepath}: ${error.message}`
              ),
              -1 * (poolSize + 1)
            );
          },
          (id: number, { filepath }: any) => {
            tasks[id].update(
              SimpleTaskState.RUNNING,
              `Hashing file ${basename(filepath)}...`
            );
          }
        );
        await pool.initialize();
        // tslint:disable-next-line:no-constant-condition
        while (true) {
          const rows = this.storage.getUncorruptedRomsWithoutHashes();
          if (rows.length === 0) {
            break;
          }

          await pool.run(
            rows.map(({ filepath, mimetype }: RomFile) => ({
              filepath,
              mimetype
            }))
          );
        }

        for (let i = 0; i < poolSize; i++) {
          tasks[i].update(SimpleTaskState.FINISHED, null);
        }

        await pool.finalize();

        update(`Hashed ${hashedFileCount} roms.`);
      }
    );
  }
}

import { filterSeries } from "p-iteration";
import { basename } from "path";
import * as readdirp from "readdirp";
import { DataStorage, RetroarchRdbFile, RetroarchRom } from "./DataStorage";
import { EntryInfo } from "./EntryInfo";
import { exists } from "./FileAccess";
import { ICatalog } from "./ICatalog";
import { SimpleTask, SimpleTaskState } from "./TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";
import { Input, ReadData, Result } from "./Worker/readRdbFile";
import { WorkerPool } from "./WorkerPool";

export class RetroarchCatalog implements ICatalog {
  constructor(
    private rdbDirectory: string,
    private libretrodbToolPath: string,
    private taskList: TaskList,
    private storage: DataStorage
  ) {}

  public async createIndex(): Promise<void> {
    await this.cleanupRemovedFiles();
    let entries = (await this.getRdbFileList()).filter(
      (entry: EntryInfo) => !this.storage.isRdbFileAlreadyKnown(entry.fullPath)
    );
    await this.indexRdbs(entries);
  }

  private async cleanupRemovedFiles(): Promise<void> {
    await this.taskList.withTask(
      new SimpleTask(`Validating loaded RETROARCH database...`),
      async (update: TaskUpdate) => {
        const storedRdbFiles = await this.storage.getRdbFilepaths();
        let iteration = 0;
        const removedRdbFiles = await filterSeries(
          storedRdbFiles,
          async (filepath: string) => {
            update(
              `Validating loaded RETROARCH database (${++iteration} / ${
                storedRdbFiles.length
              })...`
            );

            return !(await exists(filepath));
          }
        );

        for (let i = 0; i < removedRdbFiles.length; i++) {
          update(
            `Removing no longer existing rdb from db (${i + 1} / ${
              removedRdbFiles.length
            })`
          );
          await new Promise<void>(
            (
              resolve: (value?: PromiseLike<void> | void) => void,
              reject: (reason?: any) => void
            ) =>
              setImmediate(async () => {
                try {
                  await this.storage.removeRdbFileRecursive(removedRdbFiles[i]);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              })
          );
        }
        update(`Validated RETROARCH database.`);
      }
    );
  }

  private async getRdbFileList(): Promise<EntryInfo[]> {
    return await this.taskList.withTask(
      new SimpleTask("Scanning rdbs..."),
      async (update: TaskUpdate) => {
        const entries = await readdirp.promise(this.rdbDirectory, {
          type: "files",
          fileFilter: "*.rdb"
        });
        update(`Scanned ${entries.length} rdbs.`);
        return entries;
      }
    );
  }

  private async indexRdbs(entries: EntryInfo[]): Promise<void> {
    const numberOfRdbs = entries.length;
    await this.taskList.withTask(
      new SimpleTask(`Reading ${numberOfRdbs} rdbs...`),
      async (update: TaskUpdate) => {
        const poolSize = 4;
        const tasks: SimpleTask[] = [];
        for (let i = 0; i < poolSize; i++) {
          const task = new SimpleTask(`Waiting to read rdb file...`);
          this.taskList.addTask(task);
          tasks.push(task);
        }

        let processedRdbs = 0;
        const pool = new WorkerPool<Input, Result>(
          poolSize,
          `${__dirname}/Worker/readRdbFile.js`,
          async (
            total: number,
            _: number,
            __: number,
            id: number,
            result: Result
          ) => {
            tasks[id].update(
              SimpleTaskState.RUNNING,
              `Analysing roms from ${basename(result.filepath)} (${
                result.data.roms.length
              }) [indexing]...`
            );
            await this.storeRdbFile(result.data);
            tasks[id].update(
              SimpleTaskState.RUNNING,
              `Ready to read next rdb...`
            );
            update(`Reading rdbs (${++processedRdbs} / ${total})...`);
          },
          undefined,
          (id: number, { filepath }: any) => {
            tasks[id].update(
              SimpleTaskState.RUNNING,
              `Analysing roms from ${basename(filepath)}...`
            );
          },
          (id: number, _: string, data: any) => {
            tasks[id].update(SimpleTaskState.RUNNING, data);
          }
        );
        await pool.initialize();
        await pool.run(
          entries.map((entry: EntryInfo) => ({
            filepath: entry.fullPath,
            libretrodbToolPath: this.libretrodbToolPath
          }))
        );
        for (let i = 0; i < poolSize; i++) {
          tasks[i].update(SimpleTaskState.FINISHED, null);
        }
        await pool.finalize();
        update(`Read ${numberOfRdbs} rdbs.`);
      }
    );
  }

  private async storeRdbFile(result: ReadData): Promise<void> {
    const rdbFileIdMap = new Map<number, number>();

    await result.rdbs.reduce(
      (promise: Promise<void>, rdb: RetroarchRdbFile, index: number) => {
        return promise.then(
          () =>
            new Promise<void>((resolve: () => void) =>
              setImmediate(() => {
                rdbFileIdMap.set(index, this.storage.storeRdbFile(rdb));
                resolve();
              })
            )
        );
      },
      Promise.resolve()
    );

    await result.roms.reduce(
      (promise: Promise<void>, rom: RetroarchRom, _: number) => {
        return promise.then(
          () =>
            new Promise<void>((resolve: () => void) =>
              setImmediate(() => {
                this.storage.storeRetroarchRom({
                  ...rom,
                  rdbid: rdbFileIdMap.get(rom.rdbid)
                });
                resolve();
              })
            )
        );
      },
      Promise.resolve()
    );
  }
}

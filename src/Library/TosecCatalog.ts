import { filterSeries } from "p-iteration";
import { basename } from "path";
import * as readdirp from "readdirp";
import { DataStorage, DatFile, TosecGame, TosecRom } from "./DataStorage";
import { EntryInfo } from "./EntryInfo";
import { exists } from "./FileAccess";
import { ICatalog } from "./ICatalog";
import { SimpleTask, SimpleTaskState } from "./TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";
import {ParsedData, Result} from "./Worker/parseDatFile";
import { WorkerPool } from "./WorkerPool";

export class TosecCatalog implements ICatalog {
  constructor(
    private datasetDirectory: string,
    private taskList: TaskList,
    private storage: DataStorage
  ) {}

  public async createIndex(): Promise<void> {
    await this.cleanupRemovedFiles();
    let entries = (await this.getDatFileList()).filter(
      (entry: EntryInfo) => !this.storage.isDatFileAlreadyKnown(entry.fullPath)
    );
    await this.indexDatset(entries);
  }

  private async cleanupRemovedFiles(): Promise<void> {
    await this.taskList.withTask(
      new SimpleTask(`Validating loaded TOSEC datset database...`),
      async (update: TaskUpdate) => {
        const storedDatFiles = await this.storage.getDatFilepaths();
        let iteration = 0;
        const removedDatFiles = await filterSeries(
          storedDatFiles,
          async (filepath: string) => {
            update(
              `Validating loaded TOSEC datset database (${++iteration} / ${
                storedDatFiles.length
              })...`
            );

            return !(await exists(filepath));
          }
        );

        for (let i = 0; i < removedDatFiles.length; i++) {
          update(
            `Removing no longer existing dat from db (${i + 1} / ${
              removedDatFiles.length
            })`
          );
          await new Promise<void>(
            (
              resolve: (value?: PromiseLike<void> | void) => void,
              reject: (reason?: any) => void
            ) =>
              setImmediate(async () => {
                try {
                  await this.storage.removeDatFileRecursive(removedDatFiles[i]);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              })
          );
        }
        update(`Validated TOSEC dataset database.`);
      }
    );
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
        const poolSize = 4;
        const tasks: SimpleTask[] = [];
        for (let i = 0; i < poolSize; i++) {
          const task = new SimpleTask(`Waiting to parse dat file...`);
          this.taskList.addTask(task);
          tasks.push(task);
        }

        const pool = new WorkerPool<string, Result>(
          poolSize,
          `${__dirname}/Worker/parseDatFile.js`,
          async (
            total: number,
            finished: number,
            _: number,
            id: number,
            result: Result
          ) => {
            tasks[id].update(
              SimpleTaskState.RUNNING,
              `Indexing ${basename(result.filepath)}...`
            );
            await this.storeDatFile(result.data);
            update(`Parsing datsets (${finished} / ${total})...`);
          },
          (id: number, _: string, data: any) => {
            tasks[id].update(SimpleTaskState.RUNNING, data);
          }
        );
        await pool.initialize();
        await pool.run(entries.map((entry: EntryInfo) => entry.fullPath));
        for (let i = 0; i < poolSize; i++) {
          tasks[i].update(SimpleTaskState.FINISHED, null);
        }
        update(`Parsed ${numberOfDats} datsets.`);
      }
    );
  }

  private async storeDatFile(result: ParsedData): Promise<void> {
    const datFileIdMap = new Map<number, number>();
    const gameIdMap = new Map<number, number>();

    await result.datFile.reduce(
      (promise: Promise<void>, datFile: DatFile, index: number) => {
        return promise.then(
          () =>
            new Promise<void>((resolve: () => void) =>
              setImmediate(() => {
                datFileIdMap.set(index, this.storage.storeDatFile(datFile));
                resolve();
              })
            )
        );
      },
      Promise.resolve()
    );

    await result.games.reduce(
      (promise: Promise<void>, game: TosecGame, index: number) => {
        return promise.then(
          () =>
            new Promise<void>((resolve: () => void) =>
              setImmediate(() => {
                gameIdMap.set(
                  index,
                  this.storage.storeTosecGame({
                    ...game,
                    datid: datFileIdMap.get(game.datid)
                  })
                );
                resolve();
              })
            )
        );
      },
      Promise.resolve()
    );

    await result.roms.reduce(
      (promise: Promise<void>, rom: TosecRom, _: number) => {
        return promise.then(
          () =>
            new Promise<void>((resolve: () => void) =>
              setImmediate(() => {
                this.storage.storeTosecRom({
                  ...rom,
                  gameid: gameIdMap.get(rom.gameid)
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

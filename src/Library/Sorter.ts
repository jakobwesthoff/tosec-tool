import * as fse from "fs-extra";
import * as path from "path";
import { DataStorage, MatchResult } from "./DataStorage";
import { exists } from "./FileAccess";
import { SimpleTask } from "./TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";

export class Sorter {
  constructor(
    private taskList: TaskList,
    private storage: DataStorage,
    private outputDirectory: string
  ) {}

  public async sort(): Promise<void> {
    await this.taskList.withTask(
      new SimpleTask(`Sorting rom files...`),
      async (update: TaskUpdate) => {
        let sortedCount = 0;
        let duplicateCount = 0;
        const roms = await this.storage.getRomFilepaths();
        for (let i = 0; i < roms.length; i++) {
          update(`Sorting (${i + 1} / ${roms.length})...`);
          await new Promise<void>(
            (
              resolve: (value?: PromiseLike<void> | void) => void,
              reject: (reason?: any) => void
            ) =>
              setImmediate(async () => {
                const match = await this.storage.getTosecMatchForRom(roms[i]);
                if (match === undefined) {
                  await this.persistUnknown(roms[i]);
                  return resolve();
                }

                try {
                  if (await this.persistMatch(match)) {
                    sortedCount++;
                  } else {
                    duplicateCount++;
                  }

                  resolve();
                } catch (error) {
                  reject(error);
                }
              })
          );
        }
        update(
          `Sorted ${roms.length} (${roms.length -
            sortedCount} unknown, ${duplicateCount} duplicates) into ${
            this.outputDirectory
          }.`
        );
      }
    );
  }

  private async persistMatch(match: MatchResult): Promise<boolean> {
    const targetDirectory = this.getDirectoryForMatch(match);
    const targetFilepath = this.getFilepathForMatch(match);

    if (await exists(targetFilepath)) {
      return false;
    }

    await this.ensureDirectoryExists(targetDirectory);
    await this.copy(match.romFilepath, targetFilepath);

    return true;
  }

  private async persistUnknown(filepath: string): Promise<boolean> {
    const targetFilepath = this.getFilepathForUnknown(filepath);
    const targetDirectory = path.dirname(filepath);

    if (await exists(targetFilepath)) {
      return false;
    }

    await this.ensureDirectoryExists(targetDirectory);
    await this.copy(filepath, targetFilepath);

    return true;
  }

  private getDirectoryForMatch(match: MatchResult): string {
    return `${this.outputDirectory}/${match.tosecDatName}`;
  }

  private getFilepathForUnknown(filepath: string) {
    return `${this.outputDirectory}/__UNKNOWN__/${filepath}`;
  }

  private getFilepathForMatch(match: MatchResult): string {
    const pathInfo = path.parse(match.tosecRomName);
    const newFilename = `${pathInfo.name}`;
    let newExtension = "";
    if (match.romMimetype === "application/zip") {
      newExtension = `.${match.romExtension}`;
    } else {
      newExtension = `${pathInfo.ext}`;
    }
    return `${this.getDirectoryForMatch(match)}/${newFilename}${newExtension}`;
  }

  private async ensureDirectoryExists(directory: string): Promise<void> {
    await fse.ensureDir(directory);
  }

  private async copy(source: string, target: string): Promise<void> {
    await fse.copy(source, target);
  }
}

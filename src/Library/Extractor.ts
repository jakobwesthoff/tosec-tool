import * as fse from "fs-extra";
import { DataStorage, RetroarchMatchResult } from "./DataStorage";
import { exists } from "./FileAccess";
import { SimpleTask } from "./TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";

export class Extractor {
  constructor(
    private taskList: TaskList,
    private storage: DataStorage,
    private outputDirectory: string
  ) {}

  public async extract(): Promise<void> {
    await this.taskList.withTask(
      new SimpleTask(`Extracting rom files...`),
      async (update: TaskUpdate) => {
        let sortedCount = 0;
        let duplicateCount = 0;
        const roms = await this.storage.getRomFilepaths();
        for (let i = 0; i < roms.length; i++) {
          update(`Extracting (${i + 1} / ${roms.length})...`);
          await new Promise<void>(
            (
              resolve: (value?: PromiseLike<void> | void) => void,
              reject: (reason?: any) => void
            ) =>
              setImmediate(async () => {
                const match = await this.storage.getRetroarchMatchForRom(
                  roms[i]
                );
                if (match === undefined) {
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
          `Extracted ${sortedCount} roms (${roms.length -
            sortedCount} unknown, ${duplicateCount} duplicates) into ${
            this.outputDirectory
          }.`
        );
      }
    );
  }

  private async persistMatch(match: RetroarchMatchResult): Promise<boolean> {
    const targetDirectory = this.getDirectoryForMatch(match);
    const targetFilepath = this.getFilepathForMatch(match);

    if (await exists(targetFilepath)) {
      return false;
    }

    await this.ensureDirectoryExists(targetDirectory);
    await this.copy(match.romFilepath, targetFilepath);

    return true;
  }

  private getDirectoryForMatch(match: RetroarchMatchResult): string {
    return `${this.outputDirectory}/${match.rdbName}`;
  }

  private getFilepathForMatch(match: RetroarchMatchResult): string {
    const newFilename = `${match.retroarchRomName}`;
    const newExtension = `.${match.romExtension}`;
    return `${this.getDirectoryForMatch(match)}/${newFilename}${newExtension}`;
  }

  private async ensureDirectoryExists(directory: string): Promise<void> {
    await fse.ensureDir(directory);
  }

  private async copy(source: string, target: string): Promise<void> {
    await fse.copy(source, target);
  }
}

import * as Database from "better-sqlite3";
import * as fse from "fs-extra";
import * as meow from "meow";
import { DataStorage } from "./Library/DataStorage";
import { exists, isReadable } from "./Library/FileAccess";
import { HashGenerator } from "./Library/HashGenerator";
import { MimeTypeResolver } from "./Library/MimeTypeResolver";
import { RomCatalog } from "./Library/RomCatalog";
import { SimpleTask } from "./Library/TaskList/SimpleTask";
import { StaticInfoTask } from "./Library/TaskList/StaticInfoTask";
import { TaskList, TaskUpdate } from "./Library/TaskList/TaskList";
import { TosecCatalog } from "./Library/TosecCatalog";
import { TosecDatParser } from "./Library/TosecDatParser";
import logSymbols = require("log-symbols");

const cli = meow(
  `
	Usage
	  $ tosec-sorter -t <dataset-dir> -o <output-dir> [-s <storage-file>] <input-dirs...>

	Examples
	  $ tosec-sorter -t ./datasets -o ./sorted-output -s index.db ./source-1 ./source-2
`,
  {
    flags: {
      datsets: {
        type: "string",
        alias: "t"
      },
      output: {
        type: "string",
        alias: "o"
      },
      storage: {
        type: "string",
        alias: "s"
      }
    }
  }
);

if (cli.input.length < 1 || !cli.flags.datsets || !cli.flags.output) {
  cli.showHelp();
}
(async () => {
  const taskList = new TaskList();
  try {
    const inputDirectories = cli.input;
    for (const inputDirectory of inputDirectories) {
      if (!(await isReadable(inputDirectory))) {
        throw new Error(`Input path ${inputDirectory} can not be read.`);
      }
    }

    if (await exists(cli.flags.output)) {
      throw new Error(
        `Output directory ${cli.flags.output} does already exist. Aborting.`
      );
    }

    await fse.mkdir(cli.flags.output);

    const inMemoryDatabase = new Database("", {
      memory: true
    });
    const storage = new DataStorage(inMemoryDatabase, taskList);
    await storage.initialize();

    const mimeTypeResolver = new MimeTypeResolver();

    const hashGenerator = new HashGenerator();

    const romsCatalog = new RomCatalog(
      cli.input,
      taskList,
      storage,
      mimeTypeResolver,
      hashGenerator
    );

    const datParser = new TosecDatParser();
    const tosecCatalog = new TosecCatalog(
      cli.flags.datsets,
      taskList,
      storage,
      datParser
    );

    taskList.start();

    if (cli.flags.storage) {
      if (!(await exists(cli.flags.storage))) {
        taskList.addTask(
          new StaticInfoTask(
            `Database file ${cli.flags.storage} not yet available. Reindexing everything.`
          )
        );
      } else {
        await storage.loadFrom(cli.flags.storage);
      }
    }

    await tosecCatalog.createIndex();
    await romsCatalog.createIndex();

    await taskList.withTask(
      new SimpleTask(`Collecting stats...`),
      async (update: TaskUpdate) => {
        const {
          numberOfRoms,
          numberOfRomsZipped,
          numberOfTosecDats,
          numberOfTosecGames,
          numberOfTosecRoms
        } = await storage.getStorageStats();

        update(
          `Indexing complete: ${numberOfRoms} files (${numberOfRomsZipped} zipped), ${numberOfTosecDats} dats with ${numberOfTosecGames} games and ${numberOfTosecRoms} roms`
        );
      }
    );

    if (cli.flags.storage) {
      await storage.saveFile(cli.flags.storage);
    }
    taskList.stop();
  } catch (error) {
    taskList.stop();
    process.stderr.write(`${logSymbols.error} ${error.message}\n`);
  }
})();

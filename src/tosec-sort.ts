#!/usr/bin/env node

import * as Database from "better-sqlite3";
import * as meow from "meow";
import { DataStorage } from "./Library/DataStorage";
import { exists, isReadable } from "./Library/FileAccess";
import { HashGenerator } from "./Library/HashGenerator";
import { MimeTypeResolver } from "./Library/MimeTypeResolver";
import { RomCatalog } from "./Library/RomCatalog";
import { Sorter } from "./Library/Sorter";
import { SimpleTask } from "./Library/TaskList/SimpleTask";
import { StaticInfoTask } from "./Library/TaskList/StaticInfoTask";
import { TaskList, TaskUpdate } from "./Library/TaskList/TaskList";
import { TosecCatalog } from "./Library/TosecCatalog";
import { TosecDatParser } from "./Library/TosecDatParser";
import logSymbols = require("log-symbols");

const cli = meow(
  `
	Usage
	  $ tosec sort -t <dataset-dir> -o <output-dir> [-s <storage-file>] <input-dirs...>

  Options:
    -t | --tosec: Directory where the TOSEC Datset (Collection of dat files)
                  to match all input roms against can be found.
                  
    -o | --output: Directory to store the sorted and matched files in
    
    -s | --storage: File to store/load hashed and analysed results to/from.
                    Using a persistent database speeds up multiple runs
                    quite significant. Database files can however be quite
                    large (>500MiB).
                    
  Information:
    Plain rom files will be hashed as they are. If rom files are zipped, the
    hash will be calculated based on the first file found in the archive.
    Therefore there is no need to decompress rom files before sorting them.
    
    Sorted files are currently copied over and renamed to their target
    location. Therefore possibly double the size of the input files is needed
    to be available for storage. 
    
	Examples
	  $ tosec-sorter -t ./datasets -o ./sorted-output -s index.db ./source-1 ./source-2
`,
  {
    flags: {
      tosec: {
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

if (cli.input.length < 1 || !cli.flags.tosec || !cli.flags.output) {
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
      cli.flags.tosec,
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

    const sorter = new Sorter(taskList, storage, cli.flags.output);
    await sorter.sort();

    taskList.stop();
  } catch (error) {
    taskList.stop();
    process.stderr.write(`${logSymbols.error} ${error.message}\n`);
    process.exit(130);
  }
})();

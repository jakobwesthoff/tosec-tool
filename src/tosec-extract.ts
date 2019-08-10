#!/usr/bin/env node

import * as Database from "better-sqlite3";
import * as meow from "meow";
import { DataStorage } from "./Library/DataStorage";
import { Extractor } from "./Library/Extractor";
import { exists, isReadable } from "./Library/FileAccess";
import { MimeTypeResolver } from "./Library/MimeTypeResolver";
import { RetroarchCatalog } from "./Library/RetroarchCatalog";
import { RomCatalog } from "./Library/RomCatalog";
import { SimpleTask } from "./Library/TaskList/SimpleTask";
import { StaticInfoTask } from "./Library/TaskList/StaticInfoTask";
import { TaskList, TaskUpdate } from "./Library/TaskList/TaskList";
import logSymbols = require("log-symbols");

const cli = meow(
  `
	Usage
	  $ tosec extract -r <rdb-dir> -t <retroarchdb_tool> -o <output-dir> 
	                  [-s <storage-file>] <input-dirs...>

  Options:
    -r | --retroarch: Directory, where RETROARCH rdb files can be found used
                      to match rom files for extraction against.
   
    -t | --tool: Full path to the retroarchdb_tool executable needed to
                 extract the necessary information from rdb files.
                  
    -o | --output: Directory to store the sorted and matched files in
    
    -s | --storage: File to store/load hashed and analysed results to/from.
                    Using a persistent database speeds up multiple runs
                    quite significant. Database files can however be quite
                    large (>500MiB).
                    
  Information:
    Extract a RetroArch compatible subset of your rom file collection based
    on a RETROARCH rdb datafile collection. This subset of roms is ideal to
    be used with emulators like LAKKA.
  
    Plain rom files will be hashed as they are. If rom files are zipped, the
    hash will be calculated based on the first file found in the archive.
    Therefore there is no need to decompress rom files before sorting them.
    
    Extracted files are currently copied over and renamed to their target
    location. Therefore possibly double the size of the input files is needed
    to be available for storage.
    
`,
  {
    flags: {
      retroarch: {
        type: "string",
        alias: "r"
      },
      tool: {
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

if (
  cli.input.length < 1 ||
  !cli.flags.retroarch ||
  !cli.flags.tool ||
  !cli.flags.output
) {
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

    if (!(await exists(cli.flags.tool))) {
      throw new Error(
        `retroarchdb_tool not found at the given location: ${cli.flags.tool}. Aborting.`
      );
    }

    const inMemoryDatabase = new Database("", {
      memory: true
    });
    const storage = new DataStorage(inMemoryDatabase, taskList);
    await storage.initialize();

    const mimeTypeResolver = new MimeTypeResolver();

    const romsCatalog = new RomCatalog(
      cli.input,
      taskList,
      storage,
      mimeTypeResolver
    );

    const retroarchCatalog = new RetroarchCatalog(
      cli.flags.retroarch,
      cli.flags.tool,
      taskList,
      storage
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

    await retroarchCatalog.createIndex();
    await romsCatalog.createIndex();

    await taskList.withTask(
      new SimpleTask(`Collecting stats...`),
      async (update: TaskUpdate) => {
        const {
          numberOfRoms,
          numberOfRomsZipped,
          numberOfRetroarchRdbs,
          numberOfRetroarchRoms
        } = await storage.getStorageStats();

        update(
          `Indexing complete: ${numberOfRoms} files (${numberOfRomsZipped} zipped), ${numberOfRetroarchRdbs} rdbs with ${numberOfRetroarchRoms} roms`
        );
      }
    );

    if (cli.flags.storage) {
      await storage.saveFile(cli.flags.storage);
    }

    const extractor = new Extractor(taskList, storage, cli.flags.output);
    await extractor.extract();

    taskList.stop();
  } catch (error) {
    taskList.stop();
    process.stderr.write(
      `${logSymbols.error} ${error.message}: ${error.stack}\n`
    );
    process.exit(130);
  }
})();

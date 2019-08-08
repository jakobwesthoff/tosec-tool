#!/usr/bin/env node

import * as Database from "better-sqlite3";
import * as meow from "meow";
import { DataStorage } from "./Library/DataStorage";
import { exists, isReadable } from "./Library/FileAccess";
import { MimeTypeResolver } from "./Library/MimeTypeResolver";
import { RomCatalog } from "./Library/RomCatalog";
import { SimpleTask } from "./Library/TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./Library/TaskList/TaskList";
import logSymbols = require("log-symbols");

const cli = meow(
  `
	Usage
	  $ tosec cleandb <database-file>

  Information:
    All roms not available at the stored locations anymore are removed from the
    database.
    
	Examples
	  $ tosec cleandb ./index.db
`,
  {}
);

if (cli.input.length < 1) {
  cli.showHelp();
}

(async () => {
  const taskList = new TaskList();
  try {
    if (!(await exists(cli.input[0])) || !(await isReadable(cli.input[0]))) {
      throw new Error(
        `Database file ${cli.input[0]} can't be accessed for reading.`
      );
    }

    const inMemoryDatabase = new Database("", {
      memory: true
    });
    const storage = new DataStorage(inMemoryDatabase, taskList);
    await storage.initialize();

    const mimeTypeResolver = new MimeTypeResolver();
    const romCatalog = new RomCatalog([], taskList, storage, mimeTypeResolver);

    taskList.start();

    await storage.loadFrom(cli.input[0]);
    await romCatalog.cleanupRemovedFiles();
    await storage.saveFile(cli.flags.storage);

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
          `Cleanup complete: ${numberOfRoms} files (${numberOfRomsZipped} zipped), ${numberOfTosecDats} dats with ${numberOfTosecGames} games and ${numberOfTosecRoms} roms`
        );
      }
    );

    taskList.stop();
  } catch (error) {
    taskList.stop();
    process.stderr.write(`${logSymbols.error} ${error.message}\n`);
    process.exit(130);
  }
})();

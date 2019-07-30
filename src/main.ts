import * as Database from "better-sqlite3";
import * as meow from "meow";
import { DataStorage } from "./Library/DataStorage";
import { HashGenerator } from "./Library/HashGenerator";
import { MimeTypeResolver } from "./Library/MimeTypeResolver";
import { RomCatalog } from "./Library/RomCatalog";
import { TaskList } from "./Library/TaskList/TaskList";
import { TosecCatalog } from "./Library/TosecCatalog";
import { TosecDatParser } from "./Library/TosecDatParser";

const cli = meow(
  `
	Usage
	  $ tosec-sorter <input-directory> <dataset-directory> <output-directory>

	Examples
	  $ foo assorted/rom/directory tosec/datasets sorted/output
`,
  {
    flags: {}
  }
);

if (cli.input.length !== 3) {
  cli.showHelp();
}
(async () => {
  const inMemoryDatabase = new Database("", {
    memory: true
  });
  // const sorter = new Sorter(
  const taskList = new TaskList();
  const dataStorage = new DataStorage(inMemoryDatabase, taskList);
  await dataStorage.initialize();
  const mimeTypeResolver = new MimeTypeResolver();
  const hashGenerator = new HashGenerator();
  const romsCatalog = new RomCatalog(
    cli.input[0],
    taskList,
    dataStorage,
    mimeTypeResolver,
    hashGenerator
  );
  const datParser = new TosecDatParser();
  const tosecCatalog = new TosecCatalog(
    cli.input[1],
    taskList,
    dataStorage,
    datParser
  );
  //   new RomWriter(cli.input[2])
  // );
  // await sorter.run();
  taskList.start();
  try {
    await tosecCatalog.createIndex();
    await romsCatalog.createIndex();
    await dataStorage.saveToStorage("storage_test.sqlite3");
  } finally {
    taskList.stop();
  }
})();

import * as Database from "better-sqlite3";
import * as meow from "meow";
import { DataStorage } from "./Library/DataStorage";
import { HashGenerator } from "./Library/HashGenerator";
import { MimeTypeResolver } from "./Library/MimeTypeResolver";
import { RomCatalog } from "./Library/RomCatalog";
import { TaskRenderer } from "./Library/TaskRenderer";

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
  const inMemoryDatabase = new Database("rom-catalog", { memory: true });
  // const sorter = new Sorter(
  const dataStorage = new DataStorage(inMemoryDatabase);
  await dataStorage.initialize();
  const renderer = new TaskRenderer();
  const mimeTypeResolver = new MimeTypeResolver();
  const hashGenerator = new HashGenerator();
  const catalog = new RomCatalog(
    cli.input[0],
    renderer,
    dataStorage,
    mimeTypeResolver,
    hashGenerator
  );
  //   new DatsetCatalog(cli.input[1]),
  //   new RomWriter(cli.input[2])
  // );
  // await sorter.run();
  renderer.start();
  try {
    await catalog.createIndex();
  } finally {
    renderer.stop();
  }
})();

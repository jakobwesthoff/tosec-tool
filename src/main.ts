import * as Database from "better-sqlite3";
import { BackupMetadata } from "better-sqlite3";
import * as meow from "meow";
import { DataStorage } from "./Library/DataStorage";
import { HashGenerator } from "./Library/HashGenerator";
import { MimeTypeResolver } from "./Library/MimeTypeResolver";
import { TaskRenderer, TaskRendererUpdate } from "./Library/TaskRenderer";
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
  const inMemoryDatabase = new Database("rom-catalog.sqlite3", {
    memory: true
  });
  // const sorter = new Sorter(
  const dataStorage = new DataStorage(inMemoryDatabase);
  await dataStorage.initialize();
  const renderer = new TaskRenderer();
  const mimeTypeResolver = new MimeTypeResolver();
  mimeTypeResolver;
  const hashGenerator = new HashGenerator();
  hashGenerator;
  // const romsCatalog = new RomCatalog(
  //   cli.input[0],
  //   renderer,
  //   dataStorage,
  //   mimeTypeResolver,
  //   hashGenerator
  // );
  const datParser = new TosecDatParser();
  const tosecCatalog = new TosecCatalog(
    cli.input[1],
    renderer,
    dataStorage,
    datParser
  );
  //   new RomWriter(cli.input[2])
  // );
  // await sorter.run();
  renderer.start();
  try {
    // await romCatalog.createIndex();
    await tosecCatalog.createIndex();
    await renderer.withTask(
      "Persisting Database...",
      async (update: TaskRendererUpdate) => {
        await inMemoryDatabase.backup("rom-catalog-blob.sqlite3", {
          progress: (info: BackupMetadata) => {
            update(
              `Persisting database (${info.totalPages -
                info.remainingPages} / ${info.totalPages})...`
            );
            return 100;
          }
        });
      }
    );
  } finally {
    renderer.stop();
  }
})();

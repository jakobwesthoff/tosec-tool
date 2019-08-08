import { Database, Statement } from "better-sqlite3";
import * as fse from "fs-extra";
import { basename } from "path";
import { exists } from "./FileAccess";
import { HashedFile } from "./HashGenerator";
import { SimpleTask } from "./TaskList/SimpleTask";
import { TaskList, TaskUpdate } from "./TaskList/TaskList";

export interface RomFile {
  filepath: string;
  extension: string;
  mimetype: string;
  crc32: string;
  md5: string;
  sha1: string;
}

export interface DatFile {
  filepath: string;
  name: string;
  description: string | null;
  category: string;
  version: string;
  author: string | null;
  email: string | null;
  homepage: string | null;
  url: string | null;
}

export interface TosecGame {
  datid: number;
  name: string;
  description: string;
}

export interface TosecRom {
  gameid: number;
  name: string;
  size: number;
  crc32: string;
  md5: string;
  sha1: string;
}

export interface StorageStats {
  numberOfRoms: number;
  numberOfRomsZipped: number;
  numberOfTosecDats: number;
  numberOfTosecGames: number;
  numberOfTosecRoms: number;
}

export interface MatchResult {
  romFilepath: string;
  romExtension: string;
  romMimetype: string;
  tosecDatFilepath: string;
  tosecDatName: string;
  tosecDatDescription: string;
  tosecDatCategory: string;
  tosecGameName: string;
  tosecGameDescription: string;
  tosecRomName: string;
}

export class DataStorage {
  private readonly TABLES_TO_PERSIST: string[] = ["roms"];

  private romInsertStatement: Statement | undefined;
  private getRomByFilepathStatement: Statement | undefined;
  private updateRomHashesStatement: Statement | undefined;
  private datInsertStatement: Statement | undefined;
  private tosecRomInsertStatement: Statement | undefined;
  private tosecGameInsertStatement: Statement | undefined;
  private datFileKnownStatement: Statement | undefined;
  private romFileKnownStatement: Statement | undefined;
  private listOfDatFilepathsStatement: Statement | undefined;
  private listOfRomFilepathsStatement: Statement | undefined;
  private removeDatFileStatement: Statement | undefined;
  private removeRomFileStatement: Statement | undefined;
  private getTosecForRomStatement: Statement | undefined;
  private updateRomCorruptedStatement: Statement | undefined;

  constructor(private database: Database, private taskList: TaskList) {}

  // tslint:disable-next-line:max-func-body-length
  public initialize(): void {
    this.createTables();
    this.createIndices();

    this.romInsertStatement = this.database.prepare(
      `
                INSERT INTO roms (filepath, sha1, md5, crc32, extension, mimetype)
                VALUES (@filepath, @sha1, @md5, @crc32, @extension, @mimetype)
      `
    );

    this.getRomByFilepathStatement = this.database.prepare(
      `
                SELECT *
                FROM roms
                WHERE filepath = @filepath
      `
    );

    this.datInsertStatement = this.database.prepare(
      `
                INSERT INTO tosec_dats (filepath, name, description, category, version, author, email, homepage,
                                        url)
                VALUES (@filepath, @name, @description, @category, @version, @author, @email, @homepage, @url)
      `
    );

    this.tosecGameInsertStatement = this.database.prepare(
      `
                INSERT INTO tosec_games (datid, name, description)
                VALUES (@datid, @name, @description)
      `
    );

    this.tosecRomInsertStatement = this.database.prepare(
      `
                INSERT INTO tosec_roms (gameid, name, size, crc32, md5, sha1)
                VALUES (@gameid, @name, @size, @crc32, @md5, @sha1)
      `
    );

    this.updateRomHashesStatement = this.database.prepare(
      `
                UPDATE roms
                SET sha1=@sha1,
                    md5=@md5,
                    crc32=@crc32
                WHERE filepath = @filepath
      `
    );

    this.updateRomCorruptedStatement = this.database.prepare(
      `
                UPDATE roms
                SET corrupted=@reason
                WHERE filepath = @filepath
      `
    );

    this.datFileKnownStatement = this.database.prepare(
      `
                SELECT count(*) as count
                FROM tosec_dats
                WHERE filepath = @filepath
      `
    );

    this.romFileKnownStatement = this.database.prepare(
      `
                SELECT count(*) as count
                FROM roms
                WHERE filepath = @filepath
                  AND sha1 IS NOT NULL
                  AND md5 IS NOT NULL
                  AND crc32 IS NOT NULL
      `
    );

    this.listOfDatFilepathsStatement = this.database.prepare(
      `
                SELECT filepath
                from tosec_dats
      `
    );

    this.listOfRomFilepathsStatement = this.database.prepare(
      `
                SELECT filepath
                from roms
      `
    );

    this.removeDatFileStatement = this.database.prepare(
      `
                DELETE
                FROM tosec_dats
                WHERE filepath = @filepath
      `
    );

    this.removeRomFileStatement = this.database.prepare(
      `
                DELETE
                FROM roms
                WHERE filepath = @filepath
      `
    );

    this.getTosecForRomStatement = this.database.prepare(
      `
                SELECT r.filepath     as romFilepath,
                       r.extension    as romExtension,
                       r.mimetype     as romMimetype,
                       td.filepath    as tosecDatFilepath,
                       td.name        as tosecDatName,
                       td.description as tosecDatDescription,
                       td.category    as tosecDatCategory,
                       tg.name        as tosecGameName,
                       tg.description as tosecGameDescription,
                       tr.name        as tosecRomName
                FROM roms AS r
                         INNER JOIN tosec_roms AS tr ON r.sha1 = tr.sha1 AND r.md5 = tr.md5 AND
                                                        r.crc32 = tr.crc32
                         INNER JOIN tosec_games AS tg ON tr.gameid = tg.id
                         INNER JOIN tosec_dats AS td ON tg.datid = td.id
                WHERE r.filepath = @filepath
                  AND r.corrupted IS NULL
      `
    );
  }

  private createIndices(): void {
    this.database.exec(`
        CREATE UNIQUE INDEX idx_roms_filepath ON roms (filepath);
        CREATE INDEX idx_roms_hashes ON roms (sha1, md5, crc32, corrupted);
        CREATE INDEX idx_roms_mimetype ON roms (mimetype);

        CREATE UNIQUE INDEX idx_tosec_dats_filepath ON tosec_dats (filepath);

        CREATE INDEX idx_tosec_games_datids ON tosec_games (datid);

        CREATE INDEX idx_tosec_roms_hashes ON tosec_roms (sha1, md5, crc32);
        CREATE INDEX idx_tosec_roms_gameids ON tosec_roms (gameid);
    `);
  }

  private createTables(databaseName?: string): void {
    const prefix = databaseName === undefined ? "" : `${databaseName}.`;
    this.database.exec(`
      CREATE TABLE ${prefix}roms
      (
          id        INTEGER PRIMARY KEY,
          filepath  TEXT NOT NULL,
          sha1      BLOB DEFAULT NULL,
          md5       BLOB DEFAULT NULL,
          crc32     BLOB DEFAULT NULL,
          extension TEXT DEFAULT NULL,
          mimetype  TEXT DEFAULT NULL,
          corrupted TEXT DEFAULT NULL
      );

      CREATE TABLE ${prefix}tosec_dats
      (
          id          INTEGER PRIMARY KEY,
          filepath    TEXT NOT NULL,
          name        TEXT NOT NULL,
          description TEXT NULL,
          category    TEXT NOT NULL,
          version     TEXT NOT NULL,
          author      TEXT NULL,
          email       TEXT NULL,
          homepage    TEXT NULL,
          url         TEXT NULL
      );

      CREATE TABLE ${prefix}tosec_games
      (
          id          INTEGER PRIMARY KEY,
          datid       INTEGER NOT NULL,
          name        TEXT    NOT NULL,
          description TEXT    NOT NULL,
          CONSTRAINT fk_datid
            FOREIGN KEY (datid) 
                REFERENCES tosec_dats (id) 
                ON DELETE CASCADE
      );

      CREATE TABLE ${prefix}tosec_roms
      (
          id     INTEGER PRIMARY KEY,
          gameid INTEGER NOT NULL,
          name   TEXT    NOT NULL,
          size   INTEGER NOT NULL,
          crc32  BLOB    NOT NULL,
          md5    BLOB    NOT NULL,
          sha1   BLOB    NOT NULL,
          CONSTRAINT fk_gameid
            FOREIGN KEY (gameid) 
                REFERENCES tosec_games (id) 
                ON DELETE CASCADE
      );
  `);
  }

  public async loadFrom(filename: string): Promise<void> {
    if (!(await exists(filename))) {
      throw new Error(`Database file ${filename} is not readable.`);
    }

    const dbFile = basename(filename);

    try {
      const attachStatement = this.database.prepare(
        `ATTACH @filename as storage`
      );
      attachStatement.run({ filename });
    } catch (error) {
      throw new Error(`Database file could not be opened: ${error.message}`);
    }

    await this.taskList.withTask(
      new SimpleTask(`Loading database from ${dbFile}...`),
      async (update: TaskUpdate) => {
        const tables = this.TABLES_TO_PERSIST;
        for (let i = 0; i < tables.length; i++) {
          update(
            `Loading database from ${dbFile} (${i + 1} / ${tables.length})...`
          );
          try {
            await this.transferTable(`storage.${tables[i]}`, tables[i], true);
          } catch (error) {
            throw new Error(
              `Database file could not be read: ${error.message}`
            );
          }
        }
      }
    );

    const detachStatement = this.database.prepare(`DETACH storage`);
    detachStatement.run();
  }

  public async saveFile(filename: string): Promise<void> {
    if (await exists(filename)) {
      await fse.unlink(filename);
    }

    const attachStatement = this.database.prepare(
      `ATTACH @filename as storage`
    );
    attachStatement.run({ filename });

    this.createTables("storage");
    const dbfile = basename(filename);
    await this.taskList.withTask(
      new SimpleTask(`Storing database to ${dbfile}...`),
      async (update: TaskUpdate) => {
        const tables = this.TABLES_TO_PERSIST;
        for (let i = 0; i < tables.length; i++) {
          update(
            `Storing database to ${dbfile} (${i + 1} / ${tables.length})...`
          );
          await this.transferTable(tables[i], `storage.${tables[i]}`, false);
        }
      }
    );

    const detachStatement = this.database.prepare(`DETACH storage`);
    detachStatement.run();
  }

  private async transferTable(
    source: string,
    target: string,
    load: boolean = true,
    chunkSize?: number
  ): Promise<void> {
    let stmt: Statement;
    let cleanedSource = source.split(".").pop();
    let cleanedTarget = target.split(".").pop();

    if (chunkSize === undefined) {
      chunkSize = this.database.pragma("page_size", { simple: true }) * 2;
    }

    await this.taskList.withTask(
      new SimpleTask(
        `Preparing to ${load ? "load" : "store"} ${cleanedSource}...`
      ),
      async (update: TaskUpdate) => {
        this.database.exec(`BEGIN`);
        stmt = this.database.prepare(
          `
      SELECT COUNT(*) as count from ${source};
      `
        );
        const { count } = stmt.get();
        let transfered = 0;

        stmt = this.database.prepare(`INSERT INTO ${target}
                                                     SELECT *
                                                     FROM ${source} LIMIT ${chunkSize} OFFSET @offset`);

        while (transfered < count) {
          update(
            `${load ? "Loading" : "Storing"} ${cleanedTarget} (${Math.round(
              (transfered / count) * 100
            )}%)...`
          );
          await new Promise<void>(
            (
              resolve: (value?: PromiseLike<void> | void) => void,
              reject: (reason?: any) => void
            ) => {
              setImmediate(() => {
                try {
                  stmt.run({ offset: transfered });
                  transfered += chunkSize;
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
            }
          );
        }
        this.database.exec(`COMMIT`);
        update(null);
      }
    );
  }

  public storeRomFile(rom: RomFile): void {
    this.romInsertStatement.run(rom);
  }

  public getNumberOfRoms(): number {
    const stmt = this.database.prepare(`
        SELECT COUNT(*) as 'count'
        FROM roms
    `);
    const [{ count }] = stmt.all();
    return count;
  }

  public getNumberOfRomsWithoutHashes(): number {
    const stmt = this.database.prepare(
      `
                SELECT COUNT(*) as 'count'
                FROM roms
                WHERE sha1 IS NULL
                   OR md5 IS NULL
                   OR crc32 IS NULL
      `
    );
    const [{ count }] = stmt.all();
    return count;
  }

  public getUncorruptedRomsWithoutHashes(limit: number = 512): RomFile[] {
    const stmt = this.database.prepare(
      `
                SELECT *
                FROM roms
                WHERE (
                        sha1 IS NULL
                        OR md5 IS NULL
                        OR crc32 IS NULL
                    )
                  AND corrupted IS NULL
                LIMIT @limit
      `
    );

    return stmt.all({ limit });
  }

  public storeHashesForRom(filepath: string, hashes: HashedFile): void {
    this.updateRomHashesStatement.run({
      ...hashes,
      crc32: this.hexToBuffer(hashes.crc32),
      md5: this.hexToBuffer(hashes.md5),
      sha1: this.hexToBuffer(hashes.sha1),
      filepath
    });
  }

  public storeCorruptionForRom(filepath: string, reason: string): void {
    this.updateRomCorruptedStatement.run({
      filepath,
      reason
    });
  }

  public storeDatFile(dat: DatFile): number {
    const info = this.datInsertStatement.run(dat);
    return info.lastInsertRowid as number;
  }

  public isDatFileAlreadyKnown(filepath: string): boolean {
    const { count } = this.datFileKnownStatement.get({ filepath });
    return count === 1;
  }

  public isRomAlreadyKnown(filepath: string): boolean {
    const { count } = this.romFileKnownStatement.get({ filepath });
    return count === 1;
  }

  public storeTosecGame(game: TosecGame): number {
    const info = this.tosecGameInsertStatement.run(game);
    return info.lastInsertRowid as number;
  }

  public storeTosecRom(rom: TosecRom): void {
    this.tosecRomInsertStatement.run({
      ...rom,
      crc32: this.hexToBuffer(rom.crc32),
      md5: this.hexToBuffer(rom.md5),
      sha1: this.hexToBuffer(rom.sha1)
    });
  }

  public async getDatFilepaths(): Promise<string[]> {
    return (await this.listOfDatFilepathsStatement.all()).map(
      (row: { filepath: string }) => row.filepath
    );
  }

  public async getRomFilepaths(): Promise<string[]> {
    return (await this.listOfRomFilepathsStatement.all()).map(
      (row: { filepath: string }) => row.filepath
    );
  }

  public async getRomByFilepath(filepath: string): Promise<RomFile> {
    return await this.getRomByFilepathStatement.get({ filepath });
  }

  public async removeDatFileRecursive(filepath: string): Promise<void> {
    // ON DELETE CASCADE should take core of the rest.
    this.removeDatFileStatement.run({ filepath });
  }

  public async removeRomFile(filepath: string): Promise<void> {
    this.removeRomFileStatement.run({ filepath });
  }

  public getStorageStats(): StorageStats {
    let stmt: Statement;

    stmt = this.database.prepare(
      `
                SELECT COUNT(*) as numberOfRoms
                FROM roms;
      `
    );
    const { numberOfRoms } = stmt.get();

    stmt = this.database.prepare(
      `
                SELECT COUNT(*) as numberOfRomsZipped
                FROM roms
                WHERE mimetype = 'application/zip'
      `
    );
    const { numberOfRomsZipped } = stmt.get();

    stmt = this.database.prepare(
      `
                SELECT COUNT(*) as numberOfTosecDats
                FROM tosec_dats;
      `
    );
    const { numberOfTosecDats } = stmt.get();

    stmt = this.database.prepare(
      `
                SELECT COUNT(*) as numberOfTosecGames
                FROM tosec_games;
      `
    );
    const { numberOfTosecGames } = stmt.get();

    stmt = this.database.prepare(
      `
                SELECT COUNT(*) as numberOfTosecRoms
                FROM tosec_roms;
      `
    );
    const { numberOfTosecRoms } = stmt.get();

    return {
      numberOfRoms,
      numberOfRomsZipped,
      numberOfTosecDats,
      numberOfTosecGames,
      numberOfTosecRoms
    };
  }

  public async getTosecMatchForRom(
    filepath: string
  ): Promise<MatchResult | undefined> {
    return this.getTosecForRomStatement.get({ filepath });
  }

  private hexToBuffer(hex: string): Buffer {
    const buffer = Buffer.alloc(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      buffer[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    return buffer;
  }
}

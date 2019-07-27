import { Database, Statement } from "better-sqlite3";
import { HashedFile } from "./HashGenerator";

export interface RomFile extends HashedFile {
  extension: string;
  mimetype: string;
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

export class DataStorage {
  private romInsertStatement: Statement | undefined;
  private updateRomHashesStatement: Statement | undefined;
  private datInsertStatement: Statement | undefined;
  private tosecRomInsertStatement: Statement | undefined;
  private tosecGameInsertStatement: Statement | undefined;

  constructor(private database: Database) {}

  public initialize(): void {
    this.database.exec(`
        CREATE TABLE roms
        (
            id        INTEGER PRIMARY KEY,
            filepath  TEXT NOT NULL,
            sha1      BLOB DEFAULT NULL,
            md5       BLOB DEFAULT NULL,
            crc32     BLOB DEFAULT NULL,
            extension TEXT DEFAULT NULL,
            mimetype  TEXT DEFAULT NULL
        );
        CREATE UNIQUE INDEX idx_roms_filepath ON roms (filepath);
        CREATE INDEX idx_roms_hashes ON roms (sha1, md5, crc32);
        CREATE INDEX idx_roms_mimetypes ON roms (mimetype);

        CREATE TABLE tosec_dats
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
        CREATE UNIQUE INDEX idx_tosec_dats_filepath ON tosec_dats (filepath);

        CREATE TABLE tosec_games
        (
            id          INTEGER PRIMARY KEY,
            datid       INTEGER NOT NULL,
            name        TEXT    NOT NULL,
            description TEXT    NOT NULL,
            FOREIGN KEY (datid) REFERENCES tosec_dats (id)
        );
        CREATE INDEX idx_tosec_games_datids ON tosec_games (datid);

        CREATE TABLE tosec_roms
        (
            id     INTEGER PRIMARY KEY,
            gameid INTEGER NOT NULL,
            name   TEXT    NOT NULL,
            size   INTEGER NOT NULL,
            crc32  BLOB    NOT NULL,
            md5    BLOB    NOT NULL,
            sha1   BLOB    NOT NULL,
            FOREIGN KEY (gameid) REFERENCES tosec_games (id)
        );
        CREATE INDEX idx_tosec_roms_hashes ON tosec_roms (sha1, md5, crc32);
        CREATE INDEX idx_tosec_roms_gameids ON tosec_roms (gameid);
    `);

    this.romInsertStatement = this.database.prepare(
      `
                INSERT INTO roms (filepath, sha1, md5, crc32, extension, mimetype)
                VALUES (@filepath, @sha1, @md5, @crc32, @extension, @mimetype)
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

  public getRomsWithoutHashes(limit: number = 512): RomFile[] {
    const stmt = this.database.prepare(
      `
                SELECT *
                FROM roms
                WHERE sha1 IS NULL
                   OR md5 IS NULL
                   OR crc32 IS NULL
                LIMIT @limit
      `
    );

    return stmt.all({ limit });
  }

  public storeHashesForRom(hashes: HashedFile): void {
    this.updateRomHashesStatement.run({
      ...hashes,
      crc32: this.hexToBuffer(hashes.crc32),
      md5: this.hexToBuffer(hashes.md5),
      sha1: this.hexToBuffer(hashes.sha1)
    });
  }

  public storeDatFile(dat: DatFile): number {
    const info = this.datInsertStatement.run(dat);
    return info.lastInsertRowid as number;
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

  private hexToBuffer(hex: string): Buffer {
    const buffer = Buffer.alloc(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      buffer[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    return buffer;
  }
}

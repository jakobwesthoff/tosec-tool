import { Database, Statement } from "better-sqlite3";
import { HashedFile } from "./HashGenerator";

export interface Rom extends HashedFile {
  extension: string;
  mimetype: string;
}

export class DataStorage {
  private insertStatement: Statement | undefined;
  private updateHashesStatement: Statement | undefined;

  constructor(private database: Database) {}

  public async initialize(): Promise<void> {
    this.database.exec(`
        CREATE TABLE \`roms\`
        (
            id        INTEGER PRIMARY KEY,
            filepath  TEXT NOT NULL,
            sha1      TEXT DEFAULT NULL,
            md5       TEXT DEFAULT NULL,
            crc32     TEXT DEFAULT NULL,
            extension TEXT DEFAULT NULL,
            mimetype  TEXT DEFAULT NULL
        );
        CREATE UNIQUE INDEX \`idx_roms_filepath\` ON \`roms\` (filepath);
        CREATE INDEX \`idx_roms_hashes\` ON \`roms\` (sha1, md5, crc32);
        CREATE INDEX \`idx_roms_mimetypes\` ON \`roms\` (mimetype);
    `);
    this.insertStatement = this.database.prepare(
      `
                INSERT INTO \`roms\` (filepath, sha1, md5, crc32, extension, mimetype)
                VALUES (@filepath, @sha1, @md5, @crc32, @extension, @mimetype)
      `
    );

    this.updateHashesStatement = this.database.prepare(
      `
                UPDATE roms
                SET sha1=@sha1,
                    md5=@md5,
                    crc32=@crc32
                WHERE filepath = @filepath
      `
    );
  }

  public async storeRom(rom: Rom): Promise<void> {
    this.insertStatement.run(rom);
  }

  public async getNumberOfRoms(): Promise<number> {
    const stmt = this.database.prepare(`
        SELECT COUNT(*) as 'count'
        FROM roms
    `);
    const [{ count }] = stmt.all();
    return count;
  }

  public async getNumberOfRomsWithoutHashes(): Promise<number> {
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

  public async getRomsWithoutHashes(limit: number = 512): Promise<Rom[]> {
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

  public async storeHashesForRom(hashes: HashedFile): Promise<void> {
    this.updateHashesStatement.run(hashes);
  }
}

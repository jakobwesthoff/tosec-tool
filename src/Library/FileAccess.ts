import * as fs from "fs";

export const exists = async (filepath: string): Promise<boolean> =>
  new Promise<boolean>(
    (resolve: (value?: PromiseLike<boolean> | boolean) => void) => {
      fs.access(
        filepath,
        fs.constants.F_OK,
        (err: NodeJS.ErrnoException | null) => resolve(err === null)
      );
    }
  );

export const isReadable = async (filepath: string): Promise<boolean> =>
  new Promise<boolean>(
    (resolve: (value?: PromiseLike<boolean> | boolean) => void) => {
      fs.access(
        filepath,
        fs.constants.F_OK | fs.constants.R_OK,
        (err: NodeJS.ErrnoException | null) => resolve(err === null)
      );
    }
  );

export const isWritable = async (filepath: string): Promise<boolean> =>
  new Promise<boolean>(
    (resolve: (value?: PromiseLike<boolean> | boolean) => void) => {
      fs.access(
        filepath,
        fs.constants.W_OK,
        (err: NodeJS.ErrnoException | null) => resolve(err === null)
      );
    }
  );

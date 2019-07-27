import { QualifiedTag, SAXStream, Tag } from "sax";
import { Readable } from "stream";
import { DatFile, TosecGame, TosecRom } from "./DataStorage";

export type DatFileFn = (datfile: Partial<DatFile>) => void;
export type GameFn = (game: Partial<TosecGame>) => void;
export type RomFn = (rom: Partial<TosecRom>) => void;

export interface ParseCallbacks {
  datFile: DatFileFn;
  game: GameFn;
  rom: RomFn;
}

/**
 * Quite hacky parser for tosec dat files. It should however be reasonable fast,
 * while ensuring to provide results in a top down nesting order.
 */
export class TosecDatParser {
  constructor() {}

  // tslint:disable-next-line:max-func-body-length
  public parse(fileStream: Readable, fn: ParseCallbacks): Promise<void> {
    return new Promise<any>(
      (
        resolve: (value?: PromiseLike<any> | any) => void,
        reject: (reason?: any) => void
      ) => {
        let state = {
          tags: [],
          data: {},
          lastText: "",
          gameEmitted: false
        };
        const scannedTags = [
          "header",
          "game",
          "rom",
          "description",
          "name",
          "category",
          "version",
          "author",
          "email",
          "homepage",
          "url"
        ];
        const textTags = [
          "description",
          "name",
          "category",
          "version",
          "author",
          "email",
          "homepage",
          "url"
        ];
        const sax = new SAXStream(true);
        sax.on("error", reject);
        sax.on("end", resolve);
        sax.on("opentag", (tag: Tag | QualifiedTag) => {
          state.lastText = "";
          state.tags.unshift(tag.name);
          if (!scannedTags.includes(tag.name)) {
            return;
          }

          switch (true) {
            case tag.name === "game":
              state.data = tag.attributes;
              state.gameEmitted = false;
              break;
            case tag.name === "rom" &&
              state.tags.length > 1 &&
              state.tags[1] === "game":
              if (state.gameEmitted === false) {
                fn.game(state.data as any);
                state.gameEmitted = true;
                state.data = {};
              }
              fn.rom({
                name: tag.attributes.name as string,
                size: parseInt(tag.attributes.size as string, 10),
                crc32: tag.attributes.crc as string,
                md5: tag.attributes.md5 as string,
                sha1: tag.attributes.sha1 as string
              });
              break;
          }
        });
        sax.on("text", (text: string) => (state.lastText += text));
        sax.on("closetag", (tagName: string) => {
          const expectedTagName = state.tags.shift();
          if (expectedTagName !== tagName) {
            throw new Error(
              `Invalid tag stacking. Expected ${expectedTagName}, but got ${tagName}.`
            );
          }

          if (!scannedTags.includes(tagName)) {
            return;
          }

          if (textTags.includes(tagName) && state.lastText !== "") {
            state.data[tagName] = state.lastText;
          }

          switch (true) {
            case tagName === "header":
              fn.datFile(state.data as any);
              state.data = {};
              break;
            case tagName === "description" && state.tags[0] === "game":
              fn.game({ ...state.data, description: state.lastText } as any);
              state.gameEmitted = true;
              state.data = {};
          }
        });

        fileStream.pipe(sax);
      }
    );
  }
}

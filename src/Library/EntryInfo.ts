import * as fs from "fs";

// Datatype returned by readdirp, but unfortunately not exposed :(
export interface EntryInfo {
  path: string;
  fullPath: string;
  basename: string;
  stats?: fs.Stats;
  dirent?: fs.Dirent;
}

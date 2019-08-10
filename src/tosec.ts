#!/usr/bin/env node

import { spawn } from "child_process";
import * as meow from "meow";
import logSymbols = require("log-symbols");

interface Command {
  command: string;
  description: string;
}

const commands: Command[] = [
  {
    command: "sort",
    description: `Sort, structure and rename your romfiles based on a TOSEC datset.`
  },
  {
    command: "cleandb",
    description: `Remove referenced, but not longer available Rom files from database.`
  },
  {
    command: "extract",
    description: `Extract roms from your collection based on the retroarch database.`
  }
];

process.stdout.write(
  `TOSEC Tool (c) Jakob Westhoff <jakob@westhoffswelt.de>\n`
);

const cli = meow(
  `
	Usage
	  $ tosec <command> <options...>

  Options:
    --help: Display this help text
    
  Commands:
${commands
  .map(({ command, description }: Command) => `    ${command}: ${description}`)
  .join("\n")}

	Examples
	  $ tosec sorter --help
`,
  {
    autoHelp: false
  }
);

if (cli.input.length < 1) {
  // Matches on single --help as well.
  cli.showHelp();
}

const commandNames = commands.map(({ command }: Command) => command);
if (!commandNames.includes(cli.input[0].toLowerCase())) {
  process.stderr.write(`${logSymbols.error} Unknown command ${cli.input[0]}\n`);
  cli.showHelp();
}

// Pipe processing to the command.
const commandChild = spawn(`tosec-${cli.input[0]}`, process.argv.slice(3), {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "inherit", "inherit"]
});
commandChild.on("exit", (code: number) => process.exit(code));

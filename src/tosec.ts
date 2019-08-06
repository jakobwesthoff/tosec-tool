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
  {}
);

if (cli.input.length < 1) {
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
// commandChild.stdout.on("data", (data: Buffer) => process.stdout.write(data));
// commandChild.stderr.on("data", (data: Buffer) => process.stderr.write(data));
commandChild.on("exit", (code: number) => process.exit(code));

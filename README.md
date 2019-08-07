# TOSEC Tool

# About

The TOSEC Tool is a commandline utility (*cli*), which allows to perform
different tasks utilizing the [TOSEC]() database (aka. any TOSEC dataset).

## Installation

### Prerequisites

**TOSEC Tool** is written in [TypeScript]() and ran using [nodejs](). Therefore
an installed node executable is required to run the this project.

### Installing using npm

The latest version of the **TOSEC Tool** may be installed from the [npm
registry]():

```shell
$ npm install -g tosec-tool
```

This command will automatically download the tool and all its dependencies.
Furthermore it will link the needed executable files into your `PATH`.

## Running TOSEC Tool.

After installation the **TOSEC Tool** is available as `tosec` inside your
commandline interpreter:

```shell
$ tosec --help

TOSEC Tool (c) Jakob Westhoff <jakob@westhoffswelt.de>

  Tooling for usage with the TOSEC datasets and corresponding files.

  Usage
    $ tosec <command> <options...>

   Options:
     --help: Display this help text
```

The tool supports specific sub commands to do your bidding. Each command has
its own help information readily available: 

```shell
tosec sort --help

TOSEC Tool (c) Jakob Westhoff <jakob@westhoffswelt.de>

  Tooling for usage with the TOSEC datasets and corresponding files.

  Usage
    $ tosec sort -t <dataset-dir> -o <output-dir> [-s <storage-file>] <input-dirs...>

  ...
```

# Commands and Features

## Sort

Currently the TOSEC Tool only has one command: `sort`.

This command will take a TOSEC dataset, as well as some directories with stored
ROM files in it and sorts those files according to the TOSEC database. Thereby
renaming and copying the files to a properly structured output directory.
Zipped ROM files are transparently decompressed for analysing.

See `tosec sort --help` for more information.

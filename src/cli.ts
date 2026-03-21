#!/usr/bin/env node

import * as process from "node:process";
import { isAnalysisCommand, runAnalysisCommand } from "./commands/analysisCommands";
import { createCliCommandHelpers, parseArgs } from "./commands/cliArgs";
import { printHelp } from "./commands/cliHelp";
import { isEditCommand, runEditCommand } from "./commands/editCommands";
import { isSourceCommand, runSourceCommand } from "./commands/sourceCommands";
import { installNodeDomGlobals } from "./node/nodeDomRuntime";

const cliHelpers = createCliCommandHelpers();

const run = async () => {
  const { rawCommand, command, args } = parseArgs(process.argv);
  installNodeDomGlobals();

  if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    printHelp();
    return;
  }

  if (args.has("help")) {
    printHelp();
    return;
  }

  if (isSourceCommand(command)) {
    await runSourceCommand(command, args, cliHelpers);
    return;
  }

  if (isAnalysisCommand(command)) {
    await runAnalysisCommand(command, args, cliHelpers);
    return;
  }

  if (isEditCommand(command)) {
    await runEditCommand(command, args, cliHelpers);
    return;
  }

  console.error(`Unknown command: ${rawCommand}`);
  printHelp();
  process.exit(2);
};

run().catch((error) => {
  if (error instanceof Error) {
    cliHelpers.fail(error.message);
  }
  cliHelpers.fail("Unknown CLI failure");
});

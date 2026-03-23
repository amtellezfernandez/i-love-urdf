#!/usr/bin/env node

import * as process from "node:process";
import { isAnalysisCommand, runAnalysisCommand } from "./commands/analysisCommands";
import { createCliCommandHelpers, parseArgs } from "./commands/cliArgs";
import type { CompletionShell } from "./commands/cliCompletion";
import { isCompletionShell, renderCompletionHelp, renderCompletionScript } from "./commands/cliCompletion";
import { renderDoctorHelp, runDoctorCommand } from "./commands/cliDoctor";
import { printHelp } from "./commands/cliHelp";
import { renderShellHelp, runInteractiveShell } from "./commands/cliShell";
import { renderUpdateHelp, runUpdateCommand } from "./commands/cliUpdate";
import { isEditCommand, runEditCommand } from "./commands/editCommands";
import { isSourceCommand, runSourceCommand } from "./commands/sourceCommands";
import { installNodeDomGlobals } from "./node/nodeDomRuntime";

const cliHelpers = createCliCommandHelpers();

const run = async () => {
  const { rawCommand, command, args, positionals } = parseArgs(process.argv);
  installNodeDomGlobals();

  if (process.argv.length <= 2) {
    await runInteractiveShell();
    return;
  }

  if (rawCommand === "shell") {
    if (args.has("help")) {
      console.log(renderShellHelp());
      return;
    }

    await runInteractiveShell({
      initialSlashCommand: positionals[0]?.startsWith("/") ? positionals[0] : undefined,
    });
    return;
  }

  if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    if (positionals[0] === "shell") {
      console.log(renderShellHelp());
      return;
    }

    if (positionals[0] === "update") {
      console.log(renderUpdateHelp());
      return;
    }

    if (positionals[0] === "doctor") {
      console.log(renderDoctorHelp());
      return;
    }

    printHelp();
    return;
  }

  if (rawCommand === "doctor") {
    if (args.has("help")) {
      console.log(renderDoctorHelp());
      return;
    }

    await runDoctorCommand(args);
    return;
  }

  if (rawCommand === "update") {
    if (args.has("help")) {
      console.log(renderUpdateHelp());
      return;
    }

    runUpdateCommand(args);
    return;
  }

  if (rawCommand === "completion") {
    if (args.has("help")) {
      console.log(renderCompletionHelp());
      return;
    }

    const requestedShell = positionals[0];
    if (!requestedShell) {
      cliHelpers.fail(renderCompletionHelp());
    }

    if (!isCompletionShell(requestedShell)) {
      cliHelpers.fail(renderCompletionHelp());
    }

    const completionShell = requestedShell as CompletionShell;
    console.log(renderCompletionScript(completionShell));
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

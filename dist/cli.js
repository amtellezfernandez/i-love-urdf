#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("node:process");
const analysisCommands_1 = require("./commands/analysisCommands");
const cliArgs_1 = require("./commands/cliArgs");
const cliCompletion_1 = require("./commands/cliCompletion");
const cliHelp_1 = require("./commands/cliHelp");
const cliShell_1 = require("./commands/cliShell");
const cliUpdate_1 = require("./commands/cliUpdate");
const editCommands_1 = require("./commands/editCommands");
const sourceCommands_1 = require("./commands/sourceCommands");
const nodeDomRuntime_1 = require("./node/nodeDomRuntime");
const cliHelpers = (0, cliArgs_1.createCliCommandHelpers)();
const run = async () => {
    const { rawCommand, command, args, positionals } = (0, cliArgs_1.parseArgs)(process.argv);
    (0, nodeDomRuntime_1.installNodeDomGlobals)();
    if (process.argv.length <= 2) {
        await (0, cliShell_1.runInteractiveShell)();
        return;
    }
    if (rawCommand === "shell") {
        if (args.has("help")) {
            console.log((0, cliShell_1.renderShellHelp)());
            return;
        }
        await (0, cliShell_1.runInteractiveShell)({
            initialSlashCommand: positionals[0]?.startsWith("/") ? positionals[0] : undefined,
        });
        return;
    }
    if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
        if (positionals[0] === "shell") {
            console.log((0, cliShell_1.renderShellHelp)());
            return;
        }
        if (positionals[0] === "update") {
            console.log((0, cliUpdate_1.renderUpdateHelp)());
            return;
        }
        (0, cliHelp_1.printHelp)();
        return;
    }
    if (rawCommand === "update") {
        if (args.has("help")) {
            console.log((0, cliUpdate_1.renderUpdateHelp)());
            return;
        }
        (0, cliUpdate_1.runUpdateCommand)(args);
        return;
    }
    if (rawCommand === "completion") {
        if (args.has("help")) {
            console.log((0, cliCompletion_1.renderCompletionHelp)());
            return;
        }
        const requestedShell = positionals[0];
        if (!requestedShell) {
            cliHelpers.fail((0, cliCompletion_1.renderCompletionHelp)());
        }
        if (!(0, cliCompletion_1.isCompletionShell)(requestedShell)) {
            cliHelpers.fail((0, cliCompletion_1.renderCompletionHelp)());
        }
        const completionShell = requestedShell;
        console.log((0, cliCompletion_1.renderCompletionScript)(completionShell));
        return;
    }
    if (args.has("help")) {
        (0, cliHelp_1.printHelp)();
        return;
    }
    if ((0, sourceCommands_1.isSourceCommand)(command)) {
        await (0, sourceCommands_1.runSourceCommand)(command, args, cliHelpers);
        return;
    }
    if ((0, analysisCommands_1.isAnalysisCommand)(command)) {
        await (0, analysisCommands_1.runAnalysisCommand)(command, args, cliHelpers);
        return;
    }
    if ((0, editCommands_1.isEditCommand)(command)) {
        await (0, editCommands_1.runEditCommand)(command, args, cliHelpers);
        return;
    }
    console.error(`Unknown command: ${rawCommand}`);
    (0, cliHelp_1.printHelp)();
    process.exit(2);
};
run().catch((error) => {
    if (error instanceof Error) {
        cliHelpers.fail(error.message);
    }
    cliHelpers.fail("Unknown CLI failure");
});

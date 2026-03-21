#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("node:process");
const analysisCommands_1 = require("./commands/analysisCommands");
const cliArgs_1 = require("./commands/cliArgs");
const cliHelp_1 = require("./commands/cliHelp");
const editCommands_1 = require("./commands/editCommands");
const sourceCommands_1 = require("./commands/sourceCommands");
const nodeDomRuntime_1 = require("./node/nodeDomRuntime");
const cliHelpers = (0, cliArgs_1.createCliCommandHelpers)();
const run = async () => {
    const { rawCommand, command, args } = (0, cliArgs_1.parseArgs)(process.argv);
    (0, nodeDomRuntime_1.installNodeDomGlobals)();
    if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
        (0, cliHelp_1.printHelp)();
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

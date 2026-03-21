"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSourceCommand = exports.isSourceCommand = exports.SOURCE_COMMANDS = void 0;
const sourceLoadCommands_1 = require("./sourceLoadCommands");
const sourceRepositoryCommands_1 = require("./sourceRepositoryCommands");
const sourceXacroCommands_1 = require("./sourceXacroCommands");
const SOURCE_COMMAND_HANDLERS = {
    ...sourceRepositoryCommands_1.SOURCE_REPOSITORY_COMMAND_HANDLERS,
    ...sourceXacroCommands_1.SOURCE_XACRO_COMMAND_HANDLERS,
    ...sourceLoadCommands_1.SOURCE_LOAD_COMMAND_HANDLERS,
};
exports.SOURCE_COMMANDS = Object.keys(SOURCE_COMMAND_HANDLERS);
const SOURCE_COMMAND_SET = new Set(exports.SOURCE_COMMANDS);
const isSourceCommand = (command) => SOURCE_COMMAND_SET.has(command);
exports.isSourceCommand = isSourceCommand;
const runSourceCommand = async (command, args, helpers) => {
    await SOURCE_COMMAND_HANDLERS[command](args, helpers);
};
exports.runSourceCommand = runSourceCommand;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEditCommand = exports.isEditCommand = exports.EDIT_COMMANDS = void 0;
const editConversionCommands_1 = require("./editConversionCommands");
const editCommandRuntime_1 = require("./editCommandRuntime");
const editFormattingCommands_1 = require("./editFormattingCommands");
const editJointCommands_1 = require("./editJointCommands");
const editOrientationCommands_1 = require("./editOrientationCommands");
const EDIT_COMMAND_HANDLERS = {
    ...editFormattingCommands_1.EDIT_FORMATTING_COMMAND_HANDLERS,
    ...editJointCommands_1.EDIT_JOINT_COMMAND_HANDLERS,
    ...editOrientationCommands_1.EDIT_ORIENTATION_COMMAND_HANDLERS,
    ...editConversionCommands_1.EDIT_CONVERSION_COMMAND_HANDLERS,
};
exports.EDIT_COMMANDS = Object.keys(EDIT_COMMAND_HANDLERS);
const EDIT_COMMAND_SET = new Set(exports.EDIT_COMMANDS);
const isEditCommand = (command) => EDIT_COMMAND_SET.has(command);
exports.isEditCommand = isEditCommand;
const runEditCommand = async (command, args, helpers) => {
    const context = (0, editCommandRuntime_1.createEditCommandContext)(args, helpers);
    await EDIT_COMMAND_HANDLERS[command](context);
};
exports.runEditCommand = runEditCommand;

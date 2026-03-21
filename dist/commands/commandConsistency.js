"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCommandConsistency = exports.REGISTERED_COMMANDS = void 0;
const analysisCommands_1 = require("./analysisCommands");
const commandCatalog_1 = require("./commandCatalog");
const editCommands_1 = require("./editCommands");
const sourceCommands_1 = require("./sourceCommands");
exports.REGISTERED_COMMANDS = [
    ...sourceCommands_1.SOURCE_COMMANDS,
    ...analysisCommands_1.ANALYSIS_COMMANDS,
    ...editCommands_1.EDIT_COMMANDS,
];
const assertCommandConsistency = () => {
    const registeredSet = new Set(exports.REGISTERED_COMMANDS);
    const catalogSet = new Set(commandCatalog_1.SUPPORTED_COMMANDS);
    const duplicateCommands = exports.REGISTERED_COMMANDS.filter((commandName, index) => exports.REGISTERED_COMMANDS.indexOf(commandName) !== index);
    if (duplicateCommands.length > 0) {
        throw new Error(`Duplicate CLI command registrations detected: ${Array.from(new Set(duplicateCommands)).join(", ")}`);
    }
    const missingFromRegistries = commandCatalog_1.SUPPORTED_COMMANDS.filter((commandName) => !registeredSet.has(commandName));
    const missingFromCatalog = exports.REGISTERED_COMMANDS.filter((commandName) => !catalogSet.has(commandName));
    if (missingFromRegistries.length === 0 && missingFromCatalog.length === 0) {
        return;
    }
    const problems = [
        missingFromRegistries.length > 0
            ? `missing handlers for: ${missingFromRegistries.join(", ")}`
            : null,
        missingFromCatalog.length > 0
            ? `missing catalog entries for: ${missingFromCatalog.join(", ")}`
            : null,
    ]
        .filter((problem) => Boolean(problem))
        .join("; ");
    throw new Error(`CLI command metadata drift detected: ${problems}`);
};
exports.assertCommandConsistency = assertCommandConsistency;

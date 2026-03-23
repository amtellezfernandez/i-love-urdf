"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAnalysisCommand = exports.isAnalysisCommand = exports.ANALYSIS_COMMANDS = void 0;
const analysisMeshCommands_1 = require("./analysisMeshCommands");
const analysisUrdfCommands_1 = require("./analysisUrdfCommands");
const ANALYSIS_COMMAND_HANDLERS = {
    ...analysisMeshCommands_1.ANALYSIS_MESH_COMMAND_HANDLERS,
    ...analysisUrdfCommands_1.ANALYSIS_URDF_COMMAND_HANDLERS,
};
exports.ANALYSIS_COMMANDS = Object.keys(ANALYSIS_COMMAND_HANDLERS);
const ANALYSIS_COMMAND_SET = new Set(exports.ANALYSIS_COMMANDS);
const isAnalysisCommand = (command) => ANALYSIS_COMMAND_SET.has(command);
exports.isAnalysisCommand = isAnalysisCommand;
const runAnalysisCommand = async (command, args, helpers) => {
    await ANALYSIS_COMMAND_HANDLERS[command](args, helpers);
};
exports.runAnalysisCommand = runAnalysisCommand;

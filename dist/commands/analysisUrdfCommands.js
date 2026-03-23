"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANALYSIS_URDF_COMMAND_HANDLERS = void 0;
const index_1 = require("../index");
const analysisCommandRuntime_1 = require("./analysisCommandRuntime");
exports.ANALYSIS_URDF_COMMAND_HANDLERS = {
    diff: (args, helpers) => {
        const leftPath = helpers.requireStringArg(args, "left");
        const rightPath = helpers.requireStringArg(args, "right");
        (0, analysisCommandRuntime_1.emitJson)({
            ...(0, index_1.compareUrdfs)(helpers.readText(leftPath), helpers.readText(rightPath)),
            leftPath,
            rightPath,
        });
    },
    validate: (args, helpers) => {
        (0, analysisCommandRuntime_1.emitJson)((0, index_1.validateUrdf)((0, analysisCommandRuntime_1.readRequiredUrdfInput)(args, helpers).urdfContent));
    },
    "health-check": (args, helpers) => {
        const result = (0, index_1.healthCheckUrdf)((0, analysisCommandRuntime_1.readRequiredUrdfInput)(args, helpers).urdfContent);
        (0, analysisCommandRuntime_1.emitJson)(result);
        if (Boolean(args.get("strict")) && !result.ok) {
            process.exit(1);
        }
    },
    analyze: (args, helpers) => {
        (0, analysisCommandRuntime_1.emitJson)((0, index_1.analyzeUrdf)((0, analysisCommandRuntime_1.readRequiredUrdfInput)(args, helpers).urdfContent));
    },
    "robot-type": (args, helpers) => {
        (0, analysisCommandRuntime_1.emitJson)({ robotType: (0, index_1.identifyRobotType)((0, analysisCommandRuntime_1.readRequiredUrdfInput)(args, helpers).urdfContent) });
    },
    "morphology-card": (args, helpers) => {
        const { urdfContent } = (0, analysisCommandRuntime_1.readRequiredUrdfInput)(args, helpers);
        (0, analysisCommandRuntime_1.emitJson)((0, index_1.buildRobotMorphologyCard)((0, index_1.analyzeUrdf)(urdfContent), {
            nameHints: helpers.getDelimitedStringArg(args, "name-hints"),
            includeNameHeuristics: !Boolean(args.get("no-name-heuristics")),
        }));
    },
    "guess-orientation": (args, helpers) => {
        const { urdfContent } = (0, analysisCommandRuntime_1.readRequiredUrdfInput)(args, helpers);
        (0, analysisCommandRuntime_1.emitJson)((0, index_1.guessUrdfOrientation)(urdfContent, {
            targetUpAxis: helpers.getSimpleAxisArg(args, "target-up"),
            targetForwardAxis: helpers.getSimpleAxisArg(args, "target-forward"),
        }));
    },
};

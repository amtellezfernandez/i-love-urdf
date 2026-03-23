"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.identifyRobotType = void 0;
const analyzeUrdf_1 = require("./analyzeUrdf");
const robotMorphology_1 = require("./robotMorphology");
const identifyRobotType = (analysisOrUrdf) => {
    const analysis = typeof analysisOrUrdf === "string" ? (0, analyzeUrdf_1.analyzeUrdf)(analysisOrUrdf) : analysisOrUrdf;
    const morphology = (0, robotMorphology_1.analyzeRobotMorphology)(analysis);
    if (morphology.isHumanoidLike) {
        return "humanoid";
    }
    if (morphology.isWheeledLike) {
        return "wheeled";
    }
    if (morphology.armCount > 0 && morphology.legCount === 0) {
        return "arm";
    }
    return "other";
};
exports.identifyRobotType = identifyRobotType;

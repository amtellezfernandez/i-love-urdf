"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRobotOrientationCard = void 0;
const guessOrientation_1 = require("./guessOrientation");
const outputContracts_1 = require("../contracts/outputContracts");
const buildRobotOrientationContract = (payload) => (0, outputContracts_1.withOutputContract)(outputContracts_1.ROBOT_ORIENTATION_CARD_CONTRACT, payload);
const axisSpecFromAxis = (axis) => `+${axis}`;
const summarizeClassification = (likelyUpAxis) => {
    if (!likelyUpAxis)
        return "underconstrained";
    return `${likelyUpAxis}-up`;
};
const emptyVotes = () => ({
    x: 0,
    y: 0,
    z: 0,
});
const buildRobotOrientationCard = (guessOrUrdf, options = {}) => {
    const guess = typeof guessOrUrdf === "string"
        ? (0, guessOrientation_1.guessUrdfOrientation)(guessOrUrdf, options)
        : guessOrUrdf;
    return buildRobotOrientationContract({
        isValid: guess.isValid,
        error: guess.error,
        robotName: guess.robotName,
        summary: {
            classification: guess.isValid
                ? summarizeClassification(guess.likelyUpAxis)
                : "underconstrained",
            confidence: guess.confidence,
            likelyUpAxis: guess.likelyUpAxis,
            likelyUpDirection: guess.likelyUpDirection,
            likelyForwardAxis: guess.likelyForwardAxis,
            likelyForwardDirection: guess.likelyForwardDirection,
            likelyLateralAxis: guess.likelyLateralAxis,
            likelyLateralDirection: guess.likelyLateralDirection,
        },
        targetBasis: {
            up: axisSpecFromAxis(guess.targetUpAxis),
            forward: axisSpecFromAxis(guess.targetForwardAxis),
        },
        spans: guess.spans ?? emptyVotes(),
        jointAxisVotes: guess.revoluteAxisVotes ?? emptyVotes(),
        wheelAxisVotes: guess.wheelAxisVotes ?? emptyVotes(),
        wheelJointNames: guess.wheelJointNames ?? [],
        signals: guess.signals ?? [],
        report: guess.report ?? { evidence: [], conflicts: [] },
        assumptions: guess.assumptions ?? [],
        suggestedRotate90: guess.suggestedRotate90,
        suggestedApplyOrientation: guess.suggestedApplyOrientation,
    });
};
exports.buildRobotOrientationCard = buildRobotOrientationCard;

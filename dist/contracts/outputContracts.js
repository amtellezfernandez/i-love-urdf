"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withOutputContract = exports.OUTPUT_CONTRACTS = exports.HEALTH_CHECK_REPORT_CONTRACT = exports.ROBOT_MORPHOLOGY_CARD_CONTRACT = exports.ROBOT_ORIENTATION_CARD_CONTRACT = exports.ORIENTATION_GUESS_CONTRACT = exports.OUTPUT_SCHEMA_VERSION = void 0;
exports.OUTPUT_SCHEMA_VERSION = "1.0.0";
const defineOutputContract = (schema) => ({
    schema,
    schemaVersion: exports.OUTPUT_SCHEMA_VERSION,
});
exports.ORIENTATION_GUESS_CONTRACT = defineOutputContract("i-love-urdf/orientation-guess");
exports.ROBOT_ORIENTATION_CARD_CONTRACT = defineOutputContract("i-love-urdf/robot-orientation-card");
exports.ROBOT_MORPHOLOGY_CARD_CONTRACT = defineOutputContract("i-love-urdf/robot-morphology-card");
exports.HEALTH_CHECK_REPORT_CONTRACT = defineOutputContract("i-love-urdf/health-check-report");
exports.OUTPUT_CONTRACTS = {
    orientationGuess: exports.ORIENTATION_GUESS_CONTRACT,
    robotOrientationCard: exports.ROBOT_ORIENTATION_CARD_CONTRACT,
    robotMorphologyCard: exports.ROBOT_MORPHOLOGY_CARD_CONTRACT,
    healthCheckReport: exports.HEALTH_CHECK_REPORT_CONTRACT,
};
const withOutputContract = (contract, payload) => ({
    ...contract,
    ...payload,
});
exports.withOutputContract = withOutputContract;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyLoadedSourceTransform = exports.normalizeLoadedSource = exports.convertLoadedSourceToXacro = exports.convertLoadedSourceToMJCF = exports.snapLoadedSourceAxes = exports.normalizeLoadedSourceAxes = exports.canonicalOrderLoadedSource = exports.prettyPrintLoadedSource = exports.compareLoadedSources = exports.guessOrientationLoadedSource = exports.analyzeLoadedSource = exports.healthCheckLoadedSource = exports.validateLoadedSource = exports.replaceLoadedSourceUrdf = void 0;
const analyzeUrdf_1 = require("../analysis/analyzeUrdf");
const guessOrientation_1 = require("../analysis/guessOrientation");
const healthCheckUrdf_1 = require("../analysis/healthCheckUrdf");
const urdfToMJCF_1 = require("../convert/urdfToMJCF");
const urdfToXacro_1 = require("../convert/urdfToXacro");
const normalizeRobot_1 = require("../pipelines/normalizeRobot");
const canonicalOrdering_1 = require("../utils/canonicalOrdering");
const normalizeJointAxes_1 = require("../utils/normalizeJointAxes");
const prettyPrintURDF_1 = require("../utils/prettyPrintURDF");
const urdfDiffUtils_1 = require("../utils/urdfDiffUtils");
const validateUrdf_1 = require("../validation/validateUrdf");
const replaceLoadedSourceUrdf = (source, urdf) => ({
    ...source,
    urdf,
});
exports.replaceLoadedSourceUrdf = replaceLoadedSourceUrdf;
const validateLoadedSource = (source) => (0, validateUrdf_1.validateUrdf)(source.urdf);
exports.validateLoadedSource = validateLoadedSource;
const healthCheckLoadedSource = (source) => (0, healthCheckUrdf_1.healthCheckUrdf)(source.urdf);
exports.healthCheckLoadedSource = healthCheckLoadedSource;
const analyzeLoadedSource = (source) => (0, analyzeUrdf_1.analyzeUrdf)(source.urdf);
exports.analyzeLoadedSource = analyzeLoadedSource;
const guessOrientationLoadedSource = (source) => (0, guessOrientation_1.guessUrdfOrientation)(source.urdf);
exports.guessOrientationLoadedSource = guessOrientationLoadedSource;
const compareLoadedSources = (left, right) => (0, urdfDiffUtils_1.compareUrdfs)(left.urdf, right.urdf);
exports.compareLoadedSources = compareLoadedSources;
const prettyPrintLoadedSource = (source, indent = 2) => (0, exports.replaceLoadedSourceUrdf)(source, (0, prettyPrintURDF_1.prettyPrintURDF)(source.urdf, indent));
exports.prettyPrintLoadedSource = prettyPrintLoadedSource;
const canonicalOrderLoadedSource = (source) => (0, exports.replaceLoadedSourceUrdf)(source, (0, canonicalOrdering_1.canonicalOrderURDF)(source.urdf));
exports.canonicalOrderLoadedSource = canonicalOrderLoadedSource;
const normalizeLoadedSourceAxes = (source) => {
    const result = (0, normalizeJointAxes_1.normalizeJointAxes)(source.urdf);
    return {
        ...result,
        nextSource: (0, exports.replaceLoadedSourceUrdf)(source, result.urdfContent),
    };
};
exports.normalizeLoadedSourceAxes = normalizeLoadedSourceAxes;
const snapLoadedSourceAxes = (source) => {
    const result = (0, normalizeJointAxes_1.snapJointAxes)(source.urdf);
    return {
        ...result,
        nextSource: (0, exports.replaceLoadedSourceUrdf)(source, result.urdfContent),
    };
};
exports.snapLoadedSourceAxes = snapLoadedSourceAxes;
const convertLoadedSourceToMJCF = (source) => (0, urdfToMJCF_1.convertURDFToMJCF)(source.urdf);
exports.convertLoadedSourceToMJCF = convertLoadedSourceToMJCF;
const convertLoadedSourceToXacro = (source) => (0, urdfToXacro_1.convertURDFToXacro)(source.urdf);
exports.convertLoadedSourceToXacro = convertLoadedSourceToXacro;
const normalizeLoadedSource = (source, options = {}) => {
    const result = (0, normalizeRobot_1.normalizeRobot)(source.urdf, options);
    return {
        ...result,
        nextSource: result.outputUrdf ? (0, exports.replaceLoadedSourceUrdf)(source, result.outputUrdf) : source,
    };
};
exports.normalizeLoadedSource = normalizeLoadedSource;
const applyLoadedSourceTransform = (source, transform) => {
    const result = transform(source.urdf);
    return {
        ...result,
        nextSource: (0, exports.replaceLoadedSourceUrdf)(source, result.content),
    };
};
exports.applyLoadedSourceTransform = applyLoadedSourceTransform;

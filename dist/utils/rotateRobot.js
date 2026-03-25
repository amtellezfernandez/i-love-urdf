"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrientationMappingRotation = buildOrientationMappingRotation;
exports.applyGlobalRotation = applyGlobalRotation;
exports.applyOrientationToRobot = applyOrientationToRobot;
exports.rotateRobot90Degrees = rotateRobot90Degrees;
const xmlDom_1 = require("../xmlDom");
const rotationMath_1 = require("./rotationMath");
function axisSpecToVector(axis) {
    const normalized = axis.startsWith("+") || axis.startsWith("-") ? axis.slice(1) : axis;
    const sign = axis.startsWith("-") ? -1 : 1;
    switch (normalized) {
        case "x":
            return [sign, 0, 0];
        case "y":
            return [0, sign, 0];
        case "z":
            return [0, 0, sign];
        default:
            return [1, 0, 0];
    }
}
function basisFromForwardUp(forwardAxis, upAxis) {
    const forward = (0, rotationMath_1.normalizeVector)(axisSpecToVector(forwardAxis));
    const up = (0, rotationMath_1.normalizeVector)(axisSpecToVector(upAxis));
    const dot = forward[0] * up[0] + forward[1] * up[1] + forward[2] * up[2];
    if (Math.abs(dot) > 1e-9) {
        throw new Error(`Forward axis ${forwardAxis} must be orthogonal to up axis ${upAxis}.`);
    }
    const lateral = (0, rotationMath_1.normalizeVector)((0, rotationMath_1.cross)(up, forward));
    return (0, rotationMath_1.matrixFromColumns)(forward, lateral, up);
}
function buildOrientationMappingRotation(options) {
    const sourceBasis = basisFromForwardUp(options.sourceForwardAxis, options.sourceUpAxis);
    const targetBasis = basisFromForwardUp(options.targetForwardAxis ?? "x", options.targetUpAxis ?? "z");
    return (0, rotationMath_1.multiplyMatrices)(targetBasis, (0, rotationMath_1.transpose)(sourceBasis));
}
function applyGlobalRotation(urdfContent, R) {
    const xmlDoc = (0, xmlDom_1.parseXml)(urdfContent);
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        throw new Error(parserError.textContent || "URDF XML parse error");
    }
    const robot = xmlDoc.querySelector("robot");
    if (!robot) {
        throw new Error("No <robot> element found in URDF");
    }
    const RT = (0, rotationMath_1.transpose)(R);
    xmlDoc.querySelectorAll("link").forEach((link) => {
        link.querySelectorAll("visual").forEach((visual) => {
            (0, rotationMath_1.applyRotationToElementOrigin)(visual, R, RT);
        });
        link.querySelectorAll("collision").forEach((collision) => {
            (0, rotationMath_1.applyRotationToElementOrigin)(collision, R, RT);
        });
        const inertial = link.querySelector("inertial");
        if (inertial) {
            (0, rotationMath_1.applyRotationToElementOrigin)(inertial, R, RT);
            const inertia = inertial.querySelector("inertia");
            if (inertia) {
                (0, rotationMath_1.rotateInertiaTensorElement)(inertia, R);
            }
        }
    });
    xmlDoc.querySelectorAll("joint").forEach((joint) => {
        (0, rotationMath_1.applyRotationToElementOrigin)(joint, R, RT);
        const axisElement = joint.querySelector("axis");
        if (axisElement) {
            const axisXyz = (0, rotationMath_1.parseXyz)(axisElement.getAttribute("xyz"));
            const rotatedAxis = (0, rotationMath_1.normalizeVector)((0, rotationMath_1.multiplyMatrixVector)(R, axisXyz));
            axisElement.setAttribute("xyz", `${rotatedAxis[0].toFixed(6)} ${rotatedAxis[1].toFixed(6)} ${rotatedAxis[2].toFixed(6)}`);
        }
    });
    return (0, xmlDom_1.serializeXml)(xmlDoc);
}
function applyOrientationToRobot(urdfContent, options) {
    const rotation = buildOrientationMappingRotation(options);
    return applyGlobalRotation(urdfContent, rotation);
}
function rotateRobot90Degrees(urdfContent, axis) {
    const R = (0, rotationMath_1.createRotation90Degrees)(axis);
    return applyGlobalRotation(urdfContent, R);
}

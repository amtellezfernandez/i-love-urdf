"use strict";
/**
 * Parses axis information from URDF joints.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJointAxesFromDocument = parseJointAxesFromDocument;
exports.parseJointAxesFromURDF = parseJointAxesFromURDF;
const urdfParser_1 = require("./urdfParser");
/**
 * Parse axis information from an already-parsed URDF document
 */
function parseJointAxesFromDocument(xmlDoc) {
    const validation = (0, urdfParser_1.validateURDFDocument)(xmlDoc);
    if (!validation.robot) {
        console.error(validation.error);
        return {};
    }
    const joints = (0, urdfParser_1.getDirectChildrenByTag)(validation.robot, "joint");
    const axes = {};
    joints.forEach((jointElement) => {
        const jointName = jointElement.getAttribute("name");
        if (!jointName)
            return;
        const axisElement = jointElement.querySelector("axis");
        if (axisElement) {
            const xyzAttr = axisElement.getAttribute("xyz");
            if (xyzAttr) {
                const parts = xyzAttr.trim().split(/\s+/).map(parseFloat);
                axes[jointName] = {
                    xyz: [
                        parts[0] || 0,
                        parts[1] || 0,
                        parts[2] || 0,
                    ],
                };
            }
        }
    });
    return axes;
}
/**
 * Parse axis information from URDF content
 */
function parseJointAxesFromURDF(urdfContent) {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return {};
    }
    return parseJointAxesFromDocument(parsed.document);
}

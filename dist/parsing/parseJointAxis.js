"use strict";
/**
 * Parses axis information from URDF joints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJointAxesFromDocument = parseJointAxesFromDocument;
exports.parseJointAxesFromURDF = parseJointAxesFromURDF;
const xmlDom_1 = require("../xmlDom");
/**
 * Parse axis information from an already-parsed URDF document
 */
function parseJointAxesFromDocument(xmlDoc) {
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        const errorText = parserError.textContent || "Unknown XML parsing error";
        console.error("URDF parsing error:", errorText);
        return {};
    }
    const robot = xmlDoc.querySelector("robot");
    if (!robot) {
        console.error("No <robot> element found in URDF");
        return {};
    }
    const joints = xmlDoc.querySelectorAll("joint");
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
    const xmlDoc = (0, xmlDom_1.parseXml)(urdfContent);
    return parseJointAxesFromDocument(xmlDoc);
}

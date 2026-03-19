"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJointLinks = getJointLinks;
/**
 * Gets the parent and child link names for a given joint name from URDF content
 */
const xmlDom_1 = require("../xmlDom");
function getJointLinks(urdfContent, jointName) {
    try {
        const xmlDoc = (0, xmlDom_1.parseXml)(urdfContent);
        const parserError = xmlDoc.querySelector("parsererror");
        if (parserError) {
            const errorText = parserError.textContent || "Unknown XML parsing error";
            console.error("URDF parsing error:", errorText);
            return { parentLink: null, childLink: null };
        }
        // Validate robot element exists
        const robot = xmlDoc.querySelector("robot");
        if (!robot) {
            console.error("No <robot> element found in URDF");
            return { parentLink: null, childLink: null };
        }
        const joint = xmlDoc.querySelector(`joint[name="${jointName}"]`);
        if (!joint) {
            return { parentLink: null, childLink: null };
        }
        const parent = joint.querySelector("parent");
        const child = joint.querySelector("child");
        return {
            parentLink: parent?.getAttribute("link") || null,
            childLink: child?.getAttribute("link") || null,
        };
    }
    catch (error) {
        console.error("Error parsing URDF:", error);
        return { parentLink: null, childLink: null };
    }
}

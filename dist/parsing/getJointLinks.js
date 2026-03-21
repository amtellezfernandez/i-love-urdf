"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJointLinks = getJointLinks;
/**
 * Gets the parent and child link names for a given joint name from URDF content.
 */
const urdfParser_1 = require("./urdfParser");
function getJointLinks(urdfContent, jointName) {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { parentLink: null, childLink: null };
    }
    try {
        const robot = parsed.document.querySelector("robot");
        if (!robot) {
            return { parentLink: null, childLink: null };
        }
        const joint = (0, urdfParser_1.getDirectChildrenByTag)(robot, "joint").find((jointElement) => jointElement.getAttribute("name") === jointName) ?? null;
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUrdf = void 0;
const xmlDom_1 = require("../xmlDom");
const collectNames = (elements, attr) => elements
    .map((el) => el.getAttribute(attr) || "")
    .filter((name) => name.length > 0);
const getDirectChildrenByTag = (parent, tagName) => Array.from(parent.children).filter((child) => child.tagName === tagName);
const findDirectChildByTag = (parent, tagName) => getDirectChildrenByTag(parent, tagName)[0] ?? null;
const validateUrdf = (urdfContent) => {
    const xmlDoc = (0, xmlDom_1.parseXml)(urdfContent);
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        return {
            isValid: false,
            issues: [
                {
                    level: "error",
                    message: parserError.textContent || "URDF XML parse error",
                },
            ],
        };
    }
    const robots = Array.from(xmlDoc.querySelectorAll("robot"));
    if (robots.length !== 1) {
        return {
            isValid: false,
            issues: [
                {
                    level: "error",
                    message: `Expected exactly one <robot> element, found ${robots.length}.`,
                },
            ],
        };
    }
    const issues = [];
    const robot = robots[0];
    const links = getDirectChildrenByTag(robot, "link");
    if (links.length === 0) {
        issues.push({ level: "error", message: "URDF has no <link> elements." });
    }
    const joints = getDirectChildrenByTag(robot, "joint");
    const transmissions = getDirectChildrenByTag(robot, "transmission");
    const linkNames = collectNames(links, "name");
    const jointNames = collectNames(joints, "name");
    const duplicateLinks = linkNames.filter((name, idx) => linkNames.indexOf(name) !== idx);
    const duplicateJoints = jointNames.filter((name, idx) => jointNames.indexOf(name) !== idx);
    if (duplicateLinks.length) {
        issues.push({
            level: "error",
            message: `Duplicate link names: ${Array.from(new Set(duplicateLinks)).join(", ")}`,
        });
    }
    if (duplicateJoints.length) {
        issues.push({
            level: "error",
            message: `Duplicate joint names: ${Array.from(new Set(duplicateJoints)).join(", ")}`,
        });
    }
    const linkNameSet = new Set(linkNames);
    const jointNameSet = new Set(jointNames);
    joints.forEach((joint) => {
        const jointName = joint.getAttribute("name") || "joint";
        const parent = findDirectChildByTag(joint, "parent")?.getAttribute("link") || "";
        const child = findDirectChildByTag(joint, "child")?.getAttribute("link") || "";
        if (!parent || !linkNameSet.has(parent)) {
            issues.push({
                level: "error",
                message: `Joint '${jointName}' references missing parent link '${parent}'.`,
            });
        }
        if (!child || !linkNameSet.has(child)) {
            issues.push({
                level: "error",
                message: `Joint '${jointName}' references missing child link '${child}'.`,
            });
        }
    });
    transmissions.forEach((transmission) => {
        const transmissionName = transmission.getAttribute("name") || "transmission";
        const transmissionJoints = Array.from(transmission.querySelectorAll("joint"));
        transmissionJoints.forEach((jointRef) => {
            const jointName = jointRef.getAttribute("name") || "";
            if (!jointName) {
                issues.push({
                    level: "error",
                    message: `Transmission '${transmissionName}' has a <joint> element without a name.`,
                });
                return;
            }
            if (!jointNameSet.has(jointName)) {
                issues.push({
                    level: "error",
                    message: `Transmission '${transmissionName}' references missing joint '${jointName}'.`,
                });
            }
        });
    });
    return {
        isValid: !issues.some((issue) => issue.level === "error"),
        issues,
    };
};
exports.validateUrdf = validateUrdf;

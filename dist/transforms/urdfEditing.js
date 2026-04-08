"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateJointTypeInUrdf = exports.updateJointVelocityInUrdf = exports.updateJointLimitsInUrdf = exports.updateJointOriginInUrdf = exports.setJointAxisInUrdf = exports.renameLinkInUrdf = exports.renameJointInUrdf = void 0;
const urdfParser_1 = require("../parsing/urdfParser");
const urdfNames_1 = require("../utils/urdfNames");
const getRobotElement = (document) => document.querySelector("robot");
const getDirectChildrenByTag = (parent, tagName) => Array.from(parent.children).filter((element) => element.tagName === tagName);
const findNamedDirectChild = (parent, tagName, name) => getDirectChildrenByTag(parent, tagName).find((element) => element.getAttribute("name") === name) ?? null;
const validateReplacementName = (value, label) => {
    const sanitized = (0, urdfNames_1.sanitizeUrdfName)(value);
    if (!sanitized) {
        return null;
    }
    if (sanitized !== value.trim()) {
        console.warn(`${label} sanitized to "${sanitized}" before applying rename.`);
    }
    return sanitized;
};
const renameJointInUrdf = (urdfContent, oldJointName, newJointName) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const sanitizedNewName = validateReplacementName(newJointName, "Joint name");
    if (!sanitizedNewName) {
        return { success: false, content: urdfContent, error: "New joint name cannot be empty" };
    }
    if (oldJointName === sanitizedNewName) {
        return { success: true, content: urdfContent };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const joint = findNamedDirectChild(robot, "joint", oldJointName);
    if (!joint) {
        return {
            success: false,
            content: urdfContent,
            error: `Joint "${oldJointName}" not found`,
        };
    }
    if (findNamedDirectChild(robot, "joint", sanitizedNewName)) {
        return {
            success: false,
            content: urdfContent,
            error: `Joint "${sanitizedNewName}" already exists`,
        };
    }
    joint.setAttribute("name", sanitizedNewName);
    parsed.document.querySelectorAll("mimic").forEach((mimic) => {
        if (mimic.getAttribute("joint") === oldJointName) {
            mimic.setAttribute("joint", sanitizedNewName);
        }
    });
    robot.querySelectorAll("transmission joint").forEach((jointRef) => {
        if (jointRef.getAttribute("name") === oldJointName) {
            jointRef.setAttribute("name", sanitizedNewName);
        }
    });
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.renameJointInUrdf = renameJointInUrdf;
const renameLinkInUrdf = (urdfContent, oldLinkName, newLinkName) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const sanitizedNewName = validateReplacementName(newLinkName, "Link name");
    if (!sanitizedNewName) {
        return { success: false, content: urdfContent, error: "New link name cannot be empty" };
    }
    if (oldLinkName === sanitizedNewName) {
        return { success: true, content: urdfContent };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", oldLinkName);
    if (!link) {
        return {
            success: false,
            content: urdfContent,
            error: `Link "${oldLinkName}" not found`,
        };
    }
    if (findNamedDirectChild(robot, "link", sanitizedNewName)) {
        return {
            success: false,
            content: urdfContent,
            error: `Link "${sanitizedNewName}" already exists`,
        };
    }
    link.setAttribute("name", sanitizedNewName);
    parsed.document.querySelectorAll("joint").forEach((joint) => {
        const parent = joint.querySelector("parent");
        const child = joint.querySelector("child");
        if (parent?.getAttribute("link") === oldLinkName) {
            parent.setAttribute("link", sanitizedNewName);
        }
        if (child?.getAttribute("link") === oldLinkName) {
            child.setAttribute("link", sanitizedNewName);
        }
    });
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.renameLinkInUrdf = renameLinkInUrdf;
const setJointAxisInUrdf = (urdfContent, jointName, axis) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const joint = findNamedDirectChild(robot, "joint", jointName);
    if (!joint) {
        return {
            success: false,
            content: urdfContent,
            error: `Joint "${jointName}" not found`,
        };
    }
    const jointType = joint.getAttribute("type") || "fixed";
    if (jointType === "fixed" || jointType === "floating") {
        const axisElement = joint.querySelector("axis");
        if (!axisElement) {
            return { success: true, content: urdfContent };
        }
        axisElement.remove();
        return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
    }
    const length = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
    const normalizedAxis = length < 1e-10
        ? [1, 0, 0]
        : [axis[0] / length, axis[1] / length, axis[2] / length];
    let axisElement = joint.querySelector("axis");
    if (!axisElement) {
        axisElement = parsed.document.createElement("axis");
        const originTag = joint.querySelector("origin");
        const childTag = joint.querySelector("child");
        if (originTag?.nextSibling) {
            joint.insertBefore(axisElement, originTag.nextSibling);
        }
        else if (childTag?.nextSibling) {
            joint.insertBefore(axisElement, childTag.nextSibling);
        }
        else {
            joint.appendChild(axisElement);
        }
    }
    axisElement.setAttribute("xyz", `${normalizedAxis[0]} ${normalizedAxis[1]} ${normalizedAxis[2]}`);
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.setJointAxisInUrdf = setJointAxisInUrdf;
const updateJointOriginInUrdf = (urdfContent, jointName, xyz, rpy) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const joint = findNamedDirectChild(robot, "joint", jointName);
    if (!joint) {
        return {
            success: false,
            content: urdfContent,
            error: `Joint "${jointName}" not found`,
        };
    }
    let originElement = joint.querySelector("origin");
    if (!originElement) {
        originElement = parsed.document.createElement("origin");
        const parentTag = joint.querySelector("parent");
        if (parentTag) {
            joint.insertBefore(originElement, parentTag);
        }
        else if (joint.firstChild) {
            joint.insertBefore(originElement, joint.firstChild);
        }
        else {
            joint.appendChild(originElement);
        }
    }
    originElement.setAttribute("xyz", `${xyz[0]} ${xyz[1]} ${xyz[2]}`);
    originElement.setAttribute("rpy", `${rpy[0]} ${rpy[1]} ${rpy[2]}`);
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateJointOriginInUrdf = updateJointOriginInUrdf;
const updateJointLimitsInUrdf = (urdfContent, jointName, lowerLimit, upperLimit) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const joint = findNamedDirectChild(robot, "joint", jointName);
    if (!joint) {
        return { success: false, content: urdfContent, error: `Joint "${jointName}" not found` };
    }
    const jointType = joint.getAttribute("type") || "fixed";
    let limitElement = joint.querySelector("limit");
    if (jointType === "fixed" || jointType === "floating" || jointType === "planar") {
        if (limitElement) {
            limitElement.remove();
            return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
        }
        return { success: true, content: urdfContent };
    }
    if (jointType === "continuous") {
        if (!limitElement) {
            return { success: true, content: urdfContent };
        }
        limitElement.removeAttribute("lower");
        limitElement.removeAttribute("upper");
        if (limitElement.attributes.length === 0) {
            limitElement.remove();
        }
        return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
    }
    const hasLower = Number.isFinite(lowerLimit);
    const hasUpper = Number.isFinite(upperLimit);
    if (!hasLower || !hasUpper) {
        return {
            success: false,
            content: urdfContent,
            error: `Joint "${jointName}" requires both lower and upper limits`,
        };
    }
    if (lowerLimit > upperLimit) {
        return {
            success: false,
            content: urdfContent,
            error: `Joint "${jointName}" lower limit cannot be greater than upper limit`,
        };
    }
    if (!limitElement) {
        limitElement = parsed.document.createElement("limit");
        const axisTag = joint.querySelector("axis");
        const childTag = joint.querySelector("child");
        const originTag = joint.querySelector("origin");
        if (axisTag?.nextSibling) {
            joint.insertBefore(limitElement, axisTag.nextSibling);
        }
        else if (axisTag) {
            joint.appendChild(limitElement);
        }
        else if (childTag?.nextSibling) {
            joint.insertBefore(limitElement, childTag.nextSibling);
        }
        else if (originTag?.nextSibling) {
            joint.insertBefore(limitElement, originTag.nextSibling);
        }
        else {
            joint.appendChild(limitElement);
        }
    }
    limitElement.setAttribute("lower", String(lowerLimit));
    limitElement.setAttribute("upper", String(upperLimit));
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateJointLimitsInUrdf = updateJointLimitsInUrdf;
const updateJointVelocityInUrdf = (urdfContent, jointName, velocity) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const joint = findNamedDirectChild(robot, "joint", jointName);
    if (!joint) {
        return { success: false, content: urdfContent, error: `Joint "${jointName}" not found` };
    }
    let limitElement = joint.querySelector("limit");
    if (!limitElement) {
        if (velocity === null || velocity === undefined) {
            return { success: true, content: urdfContent };
        }
        limitElement = parsed.document.createElement("limit");
        joint.appendChild(limitElement);
    }
    if (velocity === null || velocity === undefined || !Number.isFinite(velocity) || velocity <= 0) {
        limitElement.removeAttribute("velocity");
    }
    else {
        limitElement.setAttribute("velocity", velocity.toString());
    }
    if (limitElement.attributes.length === 0) {
        limitElement.remove();
    }
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateJointVelocityInUrdf = updateJointVelocityInUrdf;
const updateJointTypeInUrdf = (urdfContent, jointName, jointType, lowerLimit, upperLimit) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const joint = findNamedDirectChild(robot, "joint", jointName);
    if (!joint) {
        return { success: false, content: urdfContent, error: `Joint "${jointName}" not found` };
    }
    joint.setAttribute("type", jointType);
    let axisTag = joint.querySelector("axis");
    if (jointType === "fixed" || jointType === "floating") {
        if (axisTag) {
            axisTag.remove();
            axisTag = null;
        }
    }
    else if (!axisTag && ["revolute", "continuous", "prismatic", "planar"].includes(jointType)) {
        axisTag = parsed.document.createElement("axis");
        axisTag.setAttribute("xyz", "1 0 0");
        joint.appendChild(axisTag);
    }
    let limitTag = joint.querySelector("limit");
    if (jointType === "fixed" || jointType === "floating" || jointType === "planar") {
        if (limitTag) {
            limitTag.remove();
        }
    }
    else if (jointType === "continuous") {
        if (limitTag) {
            limitTag.removeAttribute("lower");
            limitTag.removeAttribute("upper");
            if (limitTag.attributes.length === 0) {
                limitTag.remove();
            }
        }
    }
    else if (jointType === "revolute" || jointType === "prismatic") {
        if (!limitTag) {
            limitTag = parsed.document.createElement("limit");
            const childTag = joint.querySelector("child");
            const originTag = joint.querySelector("origin");
            if (axisTag?.nextSibling) {
                joint.insertBefore(limitTag, axisTag.nextSibling);
            }
            else if (axisTag) {
                joint.appendChild(limitTag);
            }
            else if (childTag?.nextSibling) {
                joint.insertBefore(limitTag, childTag.nextSibling);
            }
            else if (originTag?.nextSibling) {
                joint.insertBefore(limitTag, originTag.nextSibling);
            }
            else {
                joint.appendChild(limitTag);
            }
        }
        if (lowerLimit !== undefined) {
            limitTag.setAttribute("lower", String(lowerLimit));
        }
        else if (!limitTag.hasAttribute("lower")) {
            limitTag.setAttribute("lower", String(jointType === "revolute" ? -Math.PI : -1));
        }
        if (upperLimit !== undefined) {
            limitTag.setAttribute("upper", String(upperLimit));
        }
        else if (!limitTag.hasAttribute("upper")) {
            limitTag.setAttribute("upper", String(jointType === "revolute" ? Math.PI : 1));
        }
    }
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateJointTypeInUrdf = updateJointTypeInUrdf;

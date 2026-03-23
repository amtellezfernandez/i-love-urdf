"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMeshPathsToAssetsInUrdf = exports.updateMaterialColorInUrdf = exports.updateJointLinksInUrdf = exports.removeJointsFromUrdf = void 0;
const urdfParser_1 = require("../parsing/urdfParser");
const meshPaths_1 = require("../mesh/meshPaths");
const validateJointLinkReassignment_1 = require("../validation/validateJointLinkReassignment");
const getRobotElement = (document) => document.querySelector("robot");
const getDirectChildrenByTag = (parent, tagName) => Array.from(parent.children).filter((element) => element.tagName === tagName);
const findNamedDirectChild = (parent, tagName, name) => getDirectChildrenByTag(parent, tagName).find((element) => element.getAttribute("name") === name) ?? null;
const hexToRgba = (hex) => {
    const normalized = hex.trim();
    const r = parseInt(normalized.slice(1, 3), 16) / 255;
    const g = parseInt(normalized.slice(3, 5), 16) / 255;
    const b = parseInt(normalized.slice(5, 7), 16) / 255;
    const safe = (n) => (Number.isFinite(n) ? n : 0);
    return [safe(r), safe(g), safe(b), 1.0];
};
const removeJointsFromUrdf = (urdfContent, jointsToDelete) => {
    const jointNames = Array.from(jointsToDelete);
    if (!urdfContent.trim() || jointNames.length === 0) {
        return { success: true, content: urdfContent, removed: [] };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const removed = [];
    const removedSet = new Set();
    jointNames.forEach((jointName) => {
        const joint = findNamedDirectChild(robot, "joint", jointName);
        if (joint) {
            joint.remove();
            removed.push(jointName);
            removedSet.add(jointName);
        }
    });
    if (removedSet.size > 0) {
        getDirectChildrenByTag(robot, "transmission").forEach((transmission) => {
            const referencesRemovedJoint = Array.from(transmission.querySelectorAll("joint")).some((jointRef) => removedSet.has(jointRef.getAttribute("name") || ""));
            if (referencesRemovedJoint) {
                transmission.remove();
            }
        });
        parsed.document.querySelectorAll("mimic").forEach((mimic) => {
            if (removedSet.has(mimic.getAttribute("joint") || "")) {
                mimic.remove();
            }
        });
    }
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document), removed };
};
exports.removeJointsFromUrdf = removeJointsFromUrdf;
const updateJointLinksInUrdf = (urdfContent, jointName, parentLink, childLink) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const validation = (0, validateJointLinkReassignment_1.validateJointLinkReassignment)(urdfContent, jointName, parentLink, childLink);
    if ("error" in validation) {
        return { success: false, content: urdfContent, error: validation.error };
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
    let parentElement = joint.querySelector("parent");
    if (!parentElement) {
        parentElement = parsed.document.createElement("parent");
        joint.insertBefore(parentElement, joint.firstChild);
    }
    parentElement.setAttribute("link", parentLink);
    let childElement = joint.querySelector("child");
    if (!childElement) {
        childElement = parsed.document.createElement("child");
        if (parentElement.nextSibling) {
            joint.insertBefore(childElement, parentElement.nextSibling);
        }
        else {
            joint.appendChild(childElement);
        }
    }
    childElement.setAttribute("link", childLink);
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateJointLinksInUrdf = updateJointLinksInUrdf;
const updateMaterialColorInUrdf = (urdfContent, linkName, materialName, colorHex) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = parsed.document.querySelector("robot");
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const [r, g, b, a] = hexToRgba(colorHex);
    let material = parsed.document.querySelector(`material[name="${materialName}"]`);
    if (!material) {
        material = parsed.document.createElement("material");
        material.setAttribute("name", materialName);
        robot.appendChild(material);
    }
    let colorElement = material.querySelector("color");
    if (!colorElement) {
        colorElement = parsed.document.createElement("color");
        material.appendChild(colorElement);
    }
    colorElement.setAttribute("rgba", `${r} ${g} ${b} ${a}`);
    const link = parsed.document.querySelector(`link[name="${linkName}"]`);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    let visual = link.querySelector("visual");
    if (!visual) {
        visual = parsed.document.createElement("visual");
        const geometry = parsed.document.createElement("geometry");
        const box = parsed.document.createElement("box");
        box.setAttribute("size", "0.1 0.1 0.1");
        geometry.appendChild(box);
        visual.appendChild(geometry);
        link.appendChild(visual);
    }
    let materialRef = visual.querySelector("material");
    if (!materialRef) {
        materialRef = parsed.document.createElement("material");
        visual.appendChild(materialRef);
    }
    materialRef.setAttribute("name", materialName);
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateMaterialColorInUrdf = updateMaterialColorInUrdf;
const updateMeshPathsToAssetsInUrdf = (urdfContent) => {
    if (!urdfContent.trim()) {
        return { success: false, content: urdfContent, error: "No URDF content available" };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const sanitizeRelativePath = (value) => {
        if (!value)
            return "";
        const parts = value.split("/").filter(Boolean);
        const output = [];
        for (const part of parts) {
            if (part === "." || part === "")
                continue;
            if (part === "..") {
                output.pop();
                continue;
            }
            output.push(part);
        }
        return output.join("/");
    };
    const meshElements = parsed.document.querySelectorAll("mesh");
    meshElements.forEach((mesh) => {
        const filename = mesh.getAttribute("filename");
        if (!filename)
            return;
        const refInfo = (0, meshPaths_1.parseMeshReference)(filename);
        const rawPath = (refInfo.path || refInfo.raw || "").trim();
        if (!rawPath)
            return;
        const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(rawPath);
        const basename = rawPath.split(/[\\/]/).pop() || rawPath;
        let relativePath = refInfo.isAbsoluteFile ? basename : normalized || basename;
        if (relativePath.startsWith("assets/")) {
            relativePath = relativePath.slice("assets/".length);
        }
        const sanitized = sanitizeRelativePath(relativePath);
        const finalPath = sanitized || sanitizeRelativePath((0, meshPaths_1.normalizeMeshPathForMatch)(basename));
        if (!finalPath)
            return;
        mesh.setAttribute("filename", `assets/${finalPath}`);
    });
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateMeshPathsToAssetsInUrdf = updateMeshPathsToAssetsInUrdf;

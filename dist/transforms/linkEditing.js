"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeInertialFromLink = exports.removeCollisionFromLink = exports.removeVisualFromLink = exports.updateInertialInLink = exports.addInertialToLink = exports.updateCollisionInLink = exports.addCollisionToLink = exports.updateVisualInLink = void 0;
const urdfParser_1 = require("../parsing/urdfParser");
const meshPaths_1 = require("../mesh/meshPaths");
const DEFAULT_ORIGIN = { xyz: [0, 0, 0], rpy: [0, 0, 0] };
const getRobotElement = (document) => document.querySelector("robot");
const getDirectChildrenByTag = (parent, tagName) => Array.from(parent.children).filter((element) => element.tagName === tagName);
const findNamedDirectChild = (parent, tagName, name) => getDirectChildrenByTag(parent, tagName).find((element) => element.getAttribute("name") === name) ?? null;
const ensureOriginElement = (xmlDoc, parent, origin, insertBefore) => {
    let originElement = getDirectChildrenByTag(parent, "origin")[0] ?? null;
    if (!originElement) {
        originElement = xmlDoc.createElement("origin");
        parent.insertBefore(originElement, insertBefore ?? parent.firstChild);
    }
    originElement.setAttribute("xyz", `${origin.xyz[0]} ${origin.xyz[1]} ${origin.xyz[2]}`);
    originElement.setAttribute("rpy", `${origin.rpy[0]} ${origin.rpy[1]} ${origin.rpy[2]}`);
    return originElement;
};
const ensureGeometryElement = (xmlDoc, parent) => {
    let geometry = getDirectChildrenByTag(parent, "geometry")[0] ?? null;
    if (!geometry) {
        geometry = xmlDoc.createElement("geometry");
        parent.appendChild(geometry);
    }
    return geometry;
};
const createGeometryElement = (xmlDoc, geometryType, geometryParams) => {
    if (geometryType === "box") {
        const geometryElement = xmlDoc.createElement("box");
        geometryElement.setAttribute("size", geometryParams.size || "1 1 1");
        return geometryElement;
    }
    if (geometryType === "sphere") {
        const geometryElement = xmlDoc.createElement("sphere");
        geometryElement.setAttribute("radius", geometryParams.radius || "1");
        return geometryElement;
    }
    if (geometryType === "cylinder") {
        const geometryElement = xmlDoc.createElement("cylinder");
        geometryElement.setAttribute("radius", geometryParams.radius || "1");
        geometryElement.setAttribute("length", geometryParams.length || "1");
        return geometryElement;
    }
    const geometryElement = xmlDoc.createElement("mesh");
    geometryElement.setAttribute("filename", geometryParams.filename || "");
    if (geometryParams.scale) {
        geometryElement.setAttribute("scale", geometryParams.scale);
    }
    return geometryElement;
};
const updateGeometryElement = (xmlDoc, parent, geometryType, geometryParams) => {
    const geometry = ensureGeometryElement(xmlDoc, parent);
    geometry.querySelectorAll("box, sphere, cylinder, mesh").forEach((element) => element.remove());
    geometry.appendChild(createGeometryElement(xmlDoc, geometryType, geometryParams));
};
const ensureSafeMeshParams = (geometryType, geometryParams) => {
    if (geometryType !== "mesh" || !geometryParams.filename) {
        return { ok: true, params: geometryParams };
    }
    if (!(0, meshPaths_1.isSafeMeshPath)(geometryParams.filename)) {
        return { ok: false, error: `Unsafe mesh path: ${geometryParams.filename}` };
    }
    return {
        ok: true,
        params: {
            ...geometryParams,
            filename: (0, meshPaths_1.normalizeMeshPath)(geometryParams.filename),
        },
    };
};
const parseHexColorToRgba = (hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
        return null;
    }
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return `${r} ${g} ${b} 1.0`;
};
const updateVisualInLink = (urdfContent, linkName, visualIndex, geometryType, geometryParams, origin, materialColor) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    const visuals = getDirectChildrenByTag(link, "visual");
    if (visualIndex < 0 || visualIndex >= visuals.length) {
        return { success: false, content: urdfContent, error: `Visual ${visualIndex} not found on link "${linkName}"` };
    }
    const safeMeshParams = ensureSafeMeshParams(geometryType, geometryParams);
    if ("error" in safeMeshParams) {
        return { success: false, content: urdfContent, error: safeMeshParams.error };
    }
    const visual = visuals[visualIndex];
    ensureOriginElement(parsed.document, visual, origin);
    updateGeometryElement(parsed.document, visual, geometryType, safeMeshParams.params);
    if (materialColor) {
        const rgba = parseHexColorToRgba(materialColor);
        if (!rgba) {
            return { success: false, content: urdfContent, error: `Invalid hex color: ${materialColor}` };
        }
        let material = getDirectChildrenByTag(visual, "material")[0] ?? null;
        if (!material) {
            material = parsed.document.createElement("material");
            visual.appendChild(material);
        }
        material.setAttribute("name", `material_${linkName}`);
        let color = getDirectChildrenByTag(material, "color")[0] ?? null;
        if (!color) {
            color = parsed.document.createElement("color");
            material.appendChild(color);
        }
        color.setAttribute("rgba", rgba);
    }
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateVisualInLink = updateVisualInLink;
const addCollisionToLink = (urdfContent, linkName, geometryType, geometryParams, origin = DEFAULT_ORIGIN) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    const safeMeshParams = ensureSafeMeshParams(geometryType, geometryParams);
    if ("error" in safeMeshParams) {
        return { success: false, content: urdfContent, error: safeMeshParams.error };
    }
    const collision = parsed.document.createElement("collision");
    ensureOriginElement(parsed.document, collision, origin);
    updateGeometryElement(parsed.document, collision, geometryType, safeMeshParams.params);
    link.appendChild(collision);
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.addCollisionToLink = addCollisionToLink;
const updateCollisionInLink = (urdfContent, linkName, collisionIndex, geometryType, geometryParams, origin) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    const collisions = getDirectChildrenByTag(link, "collision");
    if (collisionIndex < 0 || collisionIndex >= collisions.length) {
        return { success: false, content: urdfContent, error: `Collision ${collisionIndex} not found on link "${linkName}"` };
    }
    const safeMeshParams = ensureSafeMeshParams(geometryType, geometryParams);
    if ("error" in safeMeshParams) {
        return { success: false, content: urdfContent, error: safeMeshParams.error };
    }
    const collision = collisions[collisionIndex];
    ensureOriginElement(parsed.document, collision, origin);
    updateGeometryElement(parsed.document, collision, geometryType, safeMeshParams.params);
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateCollisionInLink = updateCollisionInLink;
const addInertialToLink = (urdfContent, linkName, mass, inertia, origin = DEFAULT_ORIGIN) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    if (getDirectChildrenByTag(link, "inertial")[0]) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" already has an inertial element` };
    }
    const inertial = parsed.document.createElement("inertial");
    const massElement = parsed.document.createElement("mass");
    massElement.setAttribute("value", String(mass));
    inertial.appendChild(massElement);
    ensureOriginElement(parsed.document, inertial, origin, massElement.nextSibling);
    const inertiaElement = parsed.document.createElement("inertia");
    inertiaElement.setAttribute("ixx", String(inertia.ixx));
    inertiaElement.setAttribute("ixy", String(inertia.ixy));
    inertiaElement.setAttribute("ixz", String(inertia.ixz));
    inertiaElement.setAttribute("iyy", String(inertia.iyy));
    inertiaElement.setAttribute("iyz", String(inertia.iyz));
    inertiaElement.setAttribute("izz", String(inertia.izz));
    inertial.appendChild(inertiaElement);
    link.appendChild(inertial);
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.addInertialToLink = addInertialToLink;
const updateInertialInLink = (urdfContent, linkName, mass, inertia, origin) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    const inertial = getDirectChildrenByTag(link, "inertial")[0] ?? null;
    if (!inertial) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" has no inertial element` };
    }
    let massElement = getDirectChildrenByTag(inertial, "mass")[0] ?? null;
    if (!massElement) {
        massElement = parsed.document.createElement("mass");
        inertial.insertBefore(massElement, inertial.firstChild);
    }
    massElement.setAttribute("value", String(mass));
    ensureOriginElement(parsed.document, inertial, origin, massElement.nextSibling);
    let inertiaElement = getDirectChildrenByTag(inertial, "inertia")[0] ?? null;
    if (!inertiaElement) {
        inertiaElement = parsed.document.createElement("inertia");
        inertial.appendChild(inertiaElement);
    }
    inertiaElement.setAttribute("ixx", String(inertia.ixx));
    inertiaElement.setAttribute("ixy", String(inertia.ixy));
    inertiaElement.setAttribute("ixz", String(inertia.ixz));
    inertiaElement.setAttribute("iyy", String(inertia.iyy));
    inertiaElement.setAttribute("iyz", String(inertia.iyz));
    inertiaElement.setAttribute("izz", String(inertia.izz));
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.updateInertialInLink = updateInertialInLink;
const removeVisualFromLink = (urdfContent, linkName, visualIndex) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    const visuals = getDirectChildrenByTag(link, "visual");
    if (visualIndex < 0 || visualIndex >= visuals.length) {
        return { success: false, content: urdfContent, error: `Visual ${visualIndex} not found on link "${linkName}"` };
    }
    visuals[visualIndex].remove();
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.removeVisualFromLink = removeVisualFromLink;
const removeCollisionFromLink = (urdfContent, linkName, collisionIndex) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    const collisions = getDirectChildrenByTag(link, "collision");
    if (collisionIndex < 0 || collisionIndex >= collisions.length) {
        return { success: false, content: urdfContent, error: `Collision ${collisionIndex} not found on link "${linkName}"` };
    }
    collisions[collisionIndex].remove();
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.removeCollisionFromLink = removeCollisionFromLink;
const removeInertialFromLink = (urdfContent, linkName) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { success: false, content: urdfContent, error: parsed.error };
    }
    const robot = getRobotElement(parsed.document);
    if (!robot) {
        return { success: false, content: urdfContent, error: "No <robot> element found" };
    }
    const link = findNamedDirectChild(robot, "link", linkName);
    if (!link) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" not found` };
    }
    const inertial = getDirectChildrenByTag(link, "inertial")[0] ?? null;
    if (!inertial) {
        return { success: false, content: urdfContent, error: `Link "${linkName}" has no inertial element` };
    }
    inertial.remove();
    return { success: true, content: (0, urdfParser_1.serializeURDF)(parsed.document) };
};
exports.removeInertialFromLink = removeInertialFromLink;

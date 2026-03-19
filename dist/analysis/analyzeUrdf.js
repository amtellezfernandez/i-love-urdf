"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeUrdf = exports.analyzeUrdfDocument = exports.extractInertialsFromDocument = exports.extractMeshReferencesFromDocument = void 0;
const meshPaths_1 = require("../mesh/meshPaths");
const parseJointAxis_1 = require("../parsing/parseJointAxis");
const parseJointHierarchy_1 = require("../parsing/parseJointHierarchy");
const parseJointLimits_1 = require("../parsing/parseJointLimits");
const parseLinkNames_1 = require("../parsing/parseLinkNames");
const parseLinkData_1 = require("../parsing/parseLinkData");
const parseSensors_1 = require("../parsing/parseSensors");
const urdfParser_1 = require("../parsing/urdfParser");
const parseVector3 = (raw) => {
    if (!raw)
        return [0, 0, 0];
    const parts = raw.trim().split(/\s+/).map(Number);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
};
const extractMeshReferencesFromDocument = (xmlDoc) => {
    const meshReferences = new Set();
    xmlDoc.querySelectorAll("mesh").forEach((mesh) => {
        const filename = mesh.getAttribute("filename");
        if (!filename)
            return;
        const normalized = filename.trim();
        if (normalized) {
            meshReferences.add(normalized);
        }
    });
    return Array.from(meshReferences);
};
exports.extractMeshReferencesFromDocument = extractMeshReferencesFromDocument;
const extractInertialsFromDocument = (xmlDoc) => {
    const entries = [];
    xmlDoc.querySelectorAll("link").forEach((linkEl) => {
        const linkName = linkEl.getAttribute("name");
        if (!linkName)
            return;
        const inertialEl = linkEl.querySelector("inertial");
        if (!inertialEl)
            return;
        const massValue = inertialEl.querySelector("mass")?.getAttribute("value");
        const mass = massValue ? Number(massValue) : 0;
        if (!Number.isFinite(mass) || mass <= 0)
            return;
        const originEl = inertialEl.querySelector("origin");
        const origin = parseVector3(originEl?.getAttribute("xyz") ?? null);
        entries.push({ linkName, mass, origin });
    });
    return entries;
};
exports.extractInertialsFromDocument = extractInertialsFromDocument;
const parseCollisionGeometriesFromDocument = (xmlDoc) => {
    const entries = [];
    const byLink = {};
    xmlDoc.querySelectorAll("link").forEach((linkEl) => {
        const linkName = linkEl.getAttribute("name");
        if (!linkName)
            return;
        const collisions = Array.from(linkEl.querySelectorAll("collision"));
        collisions.forEach((collisionEl, index) => {
            const originEl = collisionEl.querySelector("origin");
            const origin = {
                xyz: parseVector3(originEl?.getAttribute("xyz") ?? null),
                rpy: parseVector3(originEl?.getAttribute("rpy") ?? null),
            };
            const geometryEl = collisionEl.querySelector("geometry");
            if (!geometryEl)
                return;
            const boxEl = geometryEl.querySelector("box");
            const sphereEl = geometryEl.querySelector("sphere");
            const cylinderEl = geometryEl.querySelector("cylinder");
            const meshEl = geometryEl.querySelector("mesh");
            let geometry = null;
            if (boxEl) {
                const size = parseVector3(boxEl.getAttribute("size"));
                geometry = { type: "box", size };
            }
            else if (sphereEl) {
                const radius = Number(sphereEl.getAttribute("radius"));
                geometry = { type: "sphere", radius: Number.isFinite(radius) ? radius : 1 };
            }
            else if (cylinderEl) {
                const radius = Number(cylinderEl.getAttribute("radius"));
                const length = Number(cylinderEl.getAttribute("length"));
                geometry = {
                    type: "cylinder",
                    radius: Number.isFinite(radius) ? radius : 1,
                    length: Number.isFinite(length) ? length : 1,
                };
            }
            else if (meshEl) {
                const filename = meshEl.getAttribute("filename");
                if (!filename)
                    return;
                const scale = parseVector3(meshEl.getAttribute("scale"));
                geometry = { type: "mesh", filename, scale };
            }
            if (!geometry)
                return;
            const entry = {
                linkName,
                index,
                origin,
                geometry,
            };
            entries.push(entry);
            byLink[linkName] = byLink[linkName] ? [...byLink[linkName], entry] : [entry];
        });
    });
    return { entries, byLink };
};
const parseLinkDataByNameFromDocument = (xmlDoc, linkNames) => {
    const byName = {};
    linkNames.forEach((linkName) => {
        const data = (0, parseLinkData_1.parseLinkDataFromDocument)(xmlDoc, linkName);
        if (data) {
            byName[linkName] = data;
        }
    });
    return byName;
};
const analyzeUrdfDocument = (xmlDoc) => {
    const parserError = xmlDoc.querySelector("parsererror");
    const robot = xmlDoc.querySelector("robot");
    const robotName = robot?.getAttribute("name") ?? null;
    if (parserError || !robot) {
        return {
            isValid: false,
            error: parserError?.textContent || "Invalid URDF",
            robotName,
            linkNames: [],
            rootLinks: [],
            childLinks: [],
            jointByChildLink: {},
            jointLimits: {},
            jointAxes: {},
            jointHierarchy: { rootJoints: [], allJoints: new Map(), orderedJoints: [] },
            sensors: [],
            meshReferences: [],
            absoluteFileMeshRefs: [],
            inertials: [],
            collisionEntries: [],
            collisionsByLink: {},
            linkDataByName: {},
        };
    }
    const meshReferences = (0, exports.extractMeshReferencesFromDocument)(xmlDoc);
    const absoluteFileMeshRefs = meshReferences.filter((ref) => (0, meshPaths_1.parseMeshReference)(ref).isAbsoluteFile);
    const linkNames = (0, parseLinkNames_1.parseLinkNamesFromDocument)(xmlDoc);
    const linkNameSet = new Set(linkNames);
    const jointByChildLink = {};
    const childLinksSet = new Set();
    robot.querySelectorAll("joint").forEach((joint) => {
        const child = joint.querySelector("child")?.getAttribute("link");
        const parent = joint.querySelector("parent")?.getAttribute("link");
        if (!child || !parent)
            return;
        childLinksSet.add(child);
        const originEl = joint.querySelector("origin");
        const origin = parseVector3(originEl?.getAttribute("xyz") ?? null);
        const limitEl = joint.querySelector("limit");
        const lowerRaw = limitEl?.getAttribute("lower");
        const upperRaw = limitEl?.getAttribute("upper");
        const lower = lowerRaw !== null ? Number(lowerRaw) : undefined;
        const upper = upperRaw !== null ? Number(upperRaw) : undefined;
        jointByChildLink[child] = {
            parentLink: parent,
            origin,
            type: joint.getAttribute("type") || "fixed",
            limitLower: Number.isFinite(lower) ? lower : undefined,
            limitUpper: Number.isFinite(upper) ? upper : undefined,
        };
    });
    const childLinks = Array.from(childLinksSet);
    const rootLinks = linkNames.filter((name) => !childLinksSet.has(name) && linkNameSet.has(name));
    const collisions = parseCollisionGeometriesFromDocument(xmlDoc);
    const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
    return {
        isValid: true,
        robotName,
        linkNames,
        rootLinks,
        childLinks,
        jointByChildLink,
        jointLimits: (0, parseJointLimits_1.parseJointLimitsFromDocument)(xmlDoc),
        jointAxes: (0, parseJointAxis_1.parseJointAxesFromDocument)(xmlDoc),
        jointHierarchy: (0, parseJointHierarchy_1.parseJointHierarchyFromDocument)(xmlDoc),
        sensors: (0, parseSensors_1.parseSensorsFromDocument)(xmlDoc),
        meshReferences,
        absoluteFileMeshRefs,
        inertials: (0, exports.extractInertialsFromDocument)(xmlDoc),
        collisionEntries: collisions.entries,
        collisionsByLink: collisions.byLink,
        linkDataByName,
    };
};
exports.analyzeUrdfDocument = analyzeUrdfDocument;
const analyzeUrdf = (urdfContent) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    const analysis = (0, exports.analyzeUrdfDocument)(parsed.document);
    if (!parsed.isValid) {
        return { ...analysis, isValid: false, error: parsed.error ?? analysis.error };
    }
    return analysis;
};
exports.analyzeUrdf = analyzeUrdf;

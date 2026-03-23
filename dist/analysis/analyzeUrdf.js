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
const parseVector3 = (raw, fallback = [0, 0, 0]) => {
    if (!raw)
        return fallback;
    const parts = raw.trim().split(/\s+/).map(Number);
    return [
        Number.isFinite(parts[0]) ? parts[0] : fallback[0],
        Number.isFinite(parts[1]) ? parts[1] : fallback[1],
        Number.isFinite(parts[2]) ? parts[2] : fallback[2],
    ];
};
const extractMeshReferencesFromLinkData = (linkDataByName) => {
    const meshReferences = new Set();
    Object.values(linkDataByName).forEach((linkData) => {
        [...linkData.visuals, ...linkData.collisions].forEach((entry) => {
            if (entry.geometry.type !== "mesh") {
                return;
            }
            const filename = entry.geometry.params.filename?.trim();
            if (filename) {
                meshReferences.add(filename);
            }
        });
    });
    return Array.from(meshReferences);
};
const extractMeshReferencesFromDocument = (xmlDoc) => {
    const linkNames = (0, parseLinkNames_1.parseLinkNamesFromDocument)(xmlDoc);
    const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
    return extractMeshReferencesFromLinkData(linkDataByName);
};
exports.extractMeshReferencesFromDocument = extractMeshReferencesFromDocument;
const extractInertialsFromLinkData = (linkDataByName) => Object.entries(linkDataByName).flatMap(([linkName, linkData]) => {
    if (!linkData.inertial) {
        return [];
    }
    const { mass, origin } = linkData.inertial;
    if (!Number.isFinite(mass) || mass <= 0) {
        return [];
    }
    return [{ linkName, mass, origin: origin.xyz }];
});
const extractInertialsFromDocument = (xmlDoc) => {
    const linkNames = (0, parseLinkNames_1.parseLinkNamesFromDocument)(xmlDoc);
    const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
    return extractInertialsFromLinkData(linkDataByName);
};
exports.extractInertialsFromDocument = extractInertialsFromDocument;
const summarizeCollisionsFromLinkData = (linkDataByName) => {
    const entries = [];
    const byLink = {};
    Object.entries(linkDataByName).forEach(([linkName, linkData]) => {
        linkData.collisions.forEach((collision, index) => {
            const origin = {
                xyz: collision.origin.xyz,
                rpy: collision.origin.rpy,
            };
            let geometry = null;
            if (collision.geometry.type === "box") {
                geometry = {
                    type: "box",
                    size: parseVector3(collision.geometry.params.size ?? null),
                };
            }
            else if (collision.geometry.type === "sphere") {
                const radius = Number(collision.geometry.params.radius);
                geometry = { type: "sphere", radius: Number.isFinite(radius) ? radius : 1 };
            }
            else if (collision.geometry.type === "cylinder") {
                const radius = Number(collision.geometry.params.radius);
                const length = Number(collision.geometry.params.length);
                geometry = {
                    type: "cylinder",
                    radius: Number.isFinite(radius) ? radius : 1,
                    length: Number.isFinite(length) ? length : 1,
                };
            }
            else if (collision.geometry.type === "mesh") {
                const filename = collision.geometry.params.filename;
                if (!filename) {
                    return;
                }
                geometry = {
                    type: "mesh",
                    filename,
                    scale: parseVector3(collision.geometry.params.scale ?? null, [1, 1, 1]),
                };
            }
            if (!geometry) {
                return;
            }
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
const parseCollisionGeometriesFromDocument = (xmlDoc) => {
    const linkNames = (0, parseLinkNames_1.parseLinkNamesFromDocument)(xmlDoc);
    const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
    return summarizeCollisionsFromLinkData(linkDataByName);
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
    const validation = (0, urdfParser_1.validateURDFDocument)(xmlDoc);
    const robot = validation.robot;
    const robotName = robot?.getAttribute("name") ?? null;
    if (!robot) {
        return {
            isValid: false,
            error: validation.error || "Invalid URDF",
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
    const linkNames = (0, parseLinkNames_1.parseLinkNamesFromDocument)(xmlDoc);
    const linkNameSet = new Set(linkNames);
    const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
    const meshReferences = extractMeshReferencesFromLinkData(linkDataByName);
    const absoluteFileMeshRefs = meshReferences.filter((ref) => (0, meshPaths_1.parseMeshReference)(ref).isAbsoluteFile);
    const jointByChildLink = {};
    const childLinksSet = new Set();
    (0, urdfParser_1.getDirectChildrenByTag)(robot, "joint").forEach((joint) => {
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
    const collisions = summarizeCollisionsFromLinkData(linkDataByName);
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
        inertials: extractInertialsFromLinkData(linkDataByName),
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

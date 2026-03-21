"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSha256Text = exports.computeKinematicFingerprint = exports.stripUrdfForKinematics = void 0;
const node_crypto_1 = require("node:crypto");
const nodeDomRuntime_1 = require("./nodeDomRuntime");
const DEFAULT_KINEMATIC_FINGERPRINT_DECIMALS = 6;
const VISUAL_COLLISION_REGEXPS = [
    /<visual\b[^>]*>.*?<\/visual>/gis,
    /<collision\b[^>]*>.*?<\/collision>/gis,
    /<mesh\b[^>]*\/>/gis,
    /<mesh\b[^>]*>.*?<\/mesh>/gis,
];
const parseXmlDocument = (xml) => (0, nodeDomRuntime_1.parseNodeXmlDocument)(xml, "application/xml");
const serializeXmlDocument = (document) => (0, nodeDomRuntime_1.serializeNodeXmlDocument)(document);
const tagNameOf = (element) => String(element?.tagName || "")
    .split(":")
    .pop()
    ?.toLowerCase() || "";
const hasParserError = (document) => document.querySelector("parsererror") !== null;
const parseXYZ = (raw, fallback) => {
    if (!raw)
        return fallback;
    const parts = raw.trim().split(/\s+/);
    if (parts.length !== fallback.length)
        return fallback;
    const values = [];
    for (const value of parts) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }
        values.push(parsed);
    }
    return [values[0], values[1], values[2]];
};
const quantize = (value, digits) => {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
};
const sha256Hex = (value) => (0, node_crypto_1.createHash)("sha256").update(value, "utf8").digest("hex");
const toCanonicalJson = (payload) => {
    if (Array.isArray(payload)) {
        return `[${payload.map((item) => toCanonicalJson(item)).join(",")}]`;
    }
    if (payload && typeof payload === "object") {
        const record = payload;
        const keys = Object.keys(record).sort();
        return `{${keys
            .map((key) => `${JSON.stringify(key)}:${toCanonicalJson(record[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(payload);
};
const regexStripVisualCollision = (urdfXml) => VISUAL_COLLISION_REGEXPS.reduce((current, pattern) => current.replace(pattern, ""), urdfXml);
const stripUrdfForKinematics = (urdfXml) => {
    try {
        const document = parseXmlDocument(urdfXml);
        if (hasParserError(document)) {
            return regexStripVisualCollision(urdfXml);
        }
        Array.from(document.querySelectorAll("*")).forEach((parent) => {
            Array.from(parent.children).forEach((child) => {
                const tagName = tagNameOf(child);
                if (tagName === "visual" || tagName === "collision") {
                    parent.removeChild(child);
                }
            });
        });
        const serialized = serializeXmlDocument(document);
        if (serialized.includes("<mesh")) {
            return regexStripVisualCollision(serialized);
        }
        return serialized;
    }
    catch {
        return regexStripVisualCollision(urdfXml);
    }
};
exports.stripUrdfForKinematics = stripUrdfForKinematics;
const computeKinematicFingerprint = (urdfXml, options = {}) => {
    const digits = Number.isInteger(options.quantizationDecimals)
        ? Math.max(0, Number(options.quantizationDecimals))
        : DEFAULT_KINEMATIC_FINGERPRINT_DECIMALS;
    const document = parseXmlDocument(urdfXml);
    if (hasParserError(document)) {
        throw new Error("Invalid URDF XML.");
    }
    const joints = Array.from(document.querySelectorAll("joint"));
    const links = new Set();
    const parentCounts = new Map();
    const childCounts = new Map();
    const edgeRecords = [];
    for (const joint of joints) {
        const parentName = joint.querySelector("parent")?.getAttribute("link")?.trim() || "";
        const childName = joint.querySelector("child")?.getAttribute("link")?.trim() || "";
        if (!parentName || !childName)
            continue;
        links.add(parentName);
        links.add(childName);
        parentCounts.set(parentName, (parentCounts.get(parentName) || 0) + 1);
        childCounts.set(childName, (childCounts.get(childName) || 0) + 1);
        const axis = parseXYZ(joint.querySelector("axis")?.getAttribute("xyz"), [1, 0, 0]).map((value) => quantize(value, digits));
        const originXYZ = parseXYZ(joint.querySelector("origin")?.getAttribute("xyz"), [0, 0, 0]).map((value) => quantize(value, digits));
        const originRPY = parseXYZ(joint.querySelector("origin")?.getAttribute("rpy"), [0, 0, 0]).map((value) => quantize(value, digits));
        const parseLimit = (name) => {
            const raw = joint.querySelector("limit")?.getAttribute(name);
            if (!raw)
                return null;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed))
                return null;
            return quantize(parsed, digits);
        };
        edgeRecords.push({
            jointType: joint.getAttribute("type") || "unknown",
            parent: parentName,
            child: childName,
            axis,
            originXYZ,
            originRPY,
            limits: [parseLimit("lower"), parseLimit("upper")],
        });
    }
    const linkSignature = (linkName) => [
        childCounts.get(linkName) || 0,
        parentCounts.get(linkName) || 0,
    ];
    const strictEdges = edgeRecords.map((record) => ({
        joint_type: record.jointType,
        parent_sig: linkSignature(record.parent),
        child_sig: linkSignature(record.child),
        axis: record.axis,
        origin_xyz: record.originXYZ,
        origin_rpy: record.originRPY,
        limits: record.limits,
    }));
    const looseEdges = edgeRecords.map((record) => ({
        joint_type: record.jointType,
        parent_sig: linkSignature(record.parent),
        child_sig: linkSignature(record.child),
    }));
    const strictPayload = {
        joint_count: strictEdges.length,
        link_count: links.size,
        edges: [...strictEdges].sort((left, right) => toCanonicalJson(left).localeCompare(toCanonicalJson(right))),
    };
    const loosePayload = {
        joint_count: looseEdges.length,
        link_count: links.size,
        edges: [...looseEdges].sort((left, right) => toCanonicalJson(left).localeCompare(toCanonicalJson(right))),
    };
    return {
        strict: sha256Hex(toCanonicalJson(strictPayload)),
        loose: sha256Hex(toCanonicalJson(loosePayload)),
    };
};
exports.computeKinematicFingerprint = computeKinematicFingerprint;
const computeSha256Text = (value) => sha256Hex(value);
exports.computeSha256Text = computeSha256Text;
__exportStar(require("./loadedSourceAnalysis"), exports);
__exportStar(require("./urdfUsdNode"), exports);

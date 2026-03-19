"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePlainUrdfDocument = exports.findNamedUrdfElement = exports.hasXacroSyntax = void 0;
const urdfParser_1 = require("./urdfParser");
const countUtf8Bytes = (content) => new TextEncoder().encode(content).length;
const getXmlDepth = (node, depth, maxDepth) => {
    if (depth > maxDepth)
        return depth;
    let max = depth;
    for (const child of Array.from(node.children)) {
        const childDepth = getXmlDepth(child, depth + 1, maxDepth);
        if (childDepth > max) {
            max = childDepth;
        }
        if (max > maxDepth) {
            return max;
        }
    }
    return max;
};
const hasXacroSyntax = (content) => {
    if (!content)
        return false;
    const lower = content.toLowerCase();
    if (lower.includes("xmlns:xacro"))
        return true;
    if (lower.includes("<xacro:"))
        return true;
    return /\$\{[^}]+\}/.test(content);
};
exports.hasXacroSyntax = hasXacroSyntax;
const findNamedUrdfElement = (xmlDoc, tagName, elementName) => xmlDoc.querySelector(`${tagName}[name="${elementName}"]`);
exports.findNamedUrdfElement = findNamedUrdfElement;
const parsePlainUrdfDocument = (urdfContent, options = {}) => {
    if (!urdfContent.trim()) {
        return {
            success: false,
            document: null,
            error: "Empty URDF",
            issue: "empty",
        };
    }
    if (Number.isFinite(options.maxBytes) &&
        countUtf8Bytes(urdfContent) > Number(options.maxBytes)) {
        return {
            success: false,
            document: null,
            error: `URDF content exceeds ${Math.round(Number(options.maxBytes) / (1024 * 1024))} MB`,
            issue: "oversize",
        };
    }
    if (options.rejectXacro && (0, exports.hasXacroSyntax)(urdfContent)) {
        return {
            success: false,
            document: null,
            error: "XACRO content detected; expected plain URDF XML",
            issue: "xacro",
        };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        const issue = parsed.error?.includes("No <robot> element found") ? "robot-missing" : "parse";
        return {
            success: false,
            document: null,
            error: parsed.error ?? "Invalid URDF",
            issue,
        };
    }
    if (Number.isFinite(options.maxDepth)) {
        const xmlDoc = parsed.document;
        const depth = getXmlDepth(xmlDoc.documentElement, 1, Number(options.maxDepth));
        if (depth > Number(options.maxDepth)) {
            return {
                success: false,
                document: null,
                error: `URDF depth exceeds ${Number(options.maxDepth)} levels`,
                issue: "depth",
            };
        }
    }
    return {
        success: true,
        document: parsed.document,
    };
};
exports.parsePlainUrdfDocument = parsePlainUrdfDocument;

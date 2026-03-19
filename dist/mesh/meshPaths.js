"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMeshPathForMatch = exports.parseMeshReference = exports.normalizeMeshPath = exports.isSafeMeshPath = void 0;
const traversalPattern = /(^|[\\/])\.\.([\\/]|$)/;
const isSafeMeshPath = (path) => {
    if (!path)
        return false;
    if (traversalPattern.test(path))
        return false;
    return true;
};
exports.isSafeMeshPath = isSafeMeshPath;
const normalizeMeshPath = (path) => path.trim();
exports.normalizeMeshPath = normalizeMeshPath;
const WINDOWS_ABS_PATH = /^[A-Za-z]:[\\/]/;
const parseMeshReference = (ref) => {
    const raw = ref.trim();
    if (raw.startsWith("package://")) {
        const match = raw.match(/^package:\/\/([^/]+)\/?(.*)$/);
        return {
            raw,
            scheme: "package",
            packageName: match?.[1],
            path: match?.[2] || "",
            isAbsoluteFile: false,
        };
    }
    if (raw.startsWith("file://")) {
        const path = raw.slice("file://".length);
        const isAbsoluteFile = path.startsWith("/") || WINDOWS_ABS_PATH.test(path);
        return { raw, scheme: "file", path, isAbsoluteFile };
    }
    return { raw, scheme: null, path: raw, isAbsoluteFile: false };
};
exports.parseMeshReference = parseMeshReference;
const collapsePathSegments = (path) => {
    const parts = path.split("/").filter(Boolean);
    const resolved = [];
    for (const part of parts) {
        if (part === ".") {
            continue;
        }
        if (part === "..") {
            if (resolved.length > 0 && resolved[resolved.length - 1] !== "..") {
                resolved.pop();
            }
            else {
                resolved.push("..");
            }
            continue;
        }
        resolved.push(part);
    }
    return resolved.join("/");
};
const normalizeMeshPathForMatch = (path) => {
    const cleaned = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    return collapsePathSegments(cleaned);
};
exports.normalizeMeshPathForMatch = normalizeMeshPathForMatch;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseXacroExpandResponsePayload = exports.buildXacroExpandRequestPayload = exports.createXacroFilePayloadFromText = exports.createXacroFilePayloadFromBytes = exports.buildXacroFilenameCandidates = exports.normalizeExpandedUrdfPath = exports.isUrdfXacroPath = exports.isXacroPath = exports.isXacroSupportPath = exports.XACRO_SUPPORT_EXTENSIONS = exports.XACRO_EXPAND_EMPTY_URDF_ERROR = void 0;
const xacroConfig = require("./xacroContract.constants.json");
const defaults = xacroConfig;
exports.XACRO_EXPAND_EMPTY_URDF_ERROR = "xacro produced empty output.";
const DEFAULT_XACRO_ARGS = { ...(defaults.defaultArgs ?? {}) };
exports.XACRO_SUPPORT_EXTENSIONS = Object.freeze([...(defaults.supportExtensions ?? [])]);
const normalizeXacroPayloadPath = (path) => path.replace(/\\/g, "/");
const stripDescriptionSegment = (path) => {
    if (/^description\//i.test(path)) {
        return path.replace(/^description\//i, "");
    }
    const replaced = path.replace(/\/description\//i, "/");
    return replaced === path ? null : replaced;
};
const encodeBase64FromBytes = (bytes) => {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    if (typeof btoa === "function") {
        return btoa(binary);
    }
    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes).toString("base64");
    }
    throw new Error("No base64 encoder is available in this runtime.");
};
const toUtf8Bytes = (content) => new TextEncoder().encode(content);
const isXacroSupportPath = (path) => {
    const lowered = path.toLowerCase();
    if (lowered.endsWith("package.xml"))
        return true;
    return exports.XACRO_SUPPORT_EXTENSIONS.some((ext) => lowered.endsWith(ext));
};
exports.isXacroSupportPath = isXacroSupportPath;
const isXacroPath = (path) => path.toLowerCase().endsWith(".xacro");
exports.isXacroPath = isXacroPath;
const isUrdfXacroPath = (path) => path.toLowerCase().endsWith(".urdf.xacro");
exports.isUrdfXacroPath = isUrdfXacroPath;
const normalizeExpandedUrdfPath = (path) => {
    const cleaned = path.replace(/\\/g, "/");
    const withoutXacro = cleaned.replace(/\.xacro$/i, "");
    if (withoutXacro.toLowerCase().endsWith(".urdf")) {
        return withoutXacro;
    }
    return `${withoutXacro}.urdf`;
};
exports.normalizeExpandedUrdfPath = normalizeExpandedUrdfPath;
const stripXacroSuffix = (value) => {
    const normalized = value.trim();
    if (!normalized)
        return "";
    return normalized.replace(/(\.urdf)?\.xacro$/i, "");
};
const buildXacroFilenameCandidates = (fileName) => {
    const baseName = fileName.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
    if (!baseName)
        return [];
    if ((0, exports.isUrdfXacroPath)(baseName)) {
        return [baseName, baseName.replace(/\.urdf\.xacro$/i, ".xacro")];
    }
    if ((0, exports.isXacroPath)(baseName)) {
        return [baseName];
    }
    const stem = stripXacroSuffix(baseName).replace(/\.urdf$/i, "");
    const candidates = [`${stem}.xacro`, `${baseName}.xacro`];
    return Array.from(new Set(candidates.filter((item) => item.length > 0)));
};
exports.buildXacroFilenameCandidates = buildXacroFilenameCandidates;
const createXacroFilePayloadFromBytes = (path, bytes) => ({
    path,
    content_base64: encodeBase64FromBytes(bytes),
});
exports.createXacroFilePayloadFromBytes = createXacroFilePayloadFromBytes;
const createXacroFilePayloadFromText = (path, content) => (0, exports.createXacroFilePayloadFromBytes)(path, toUtf8Bytes(content));
exports.createXacroFilePayloadFromText = createXacroFilePayloadFromText;
const buildXacroPayloadPathAliases = (path) => {
    const normalizedPath = normalizeXacroPayloadPath(path);
    const basePaths = [normalizedPath];
    const descriptionAlias = stripDescriptionSegment(normalizedPath);
    if (descriptionAlias) {
        basePaths.push(descriptionAlias);
    }
    const aliases = new Set();
    for (const basePath of basePaths) {
        aliases.add(basePath);
        const fileName = basePath.split("/").pop() || basePath;
        if (!(0, exports.isXacroPath)(fileName))
            continue;
        const lastSlash = basePath.lastIndexOf("/");
        const directory = lastSlash >= 0 ? basePath.slice(0, lastSlash) : "";
        const prefix = directory ? `${directory}/` : "";
        const stem = fileName.replace(/(\.urdf)?\.xacro$/i, "");
        if ((0, exports.isUrdfXacroPath)(fileName)) {
            aliases.add(`${prefix}${stem}.xacro`);
        }
        else {
            aliases.add(`${prefix}${stem}.urdf.xacro`);
        }
    }
    return Array.from(aliases);
};
const expandXacroPayloadFiles = (files) => {
    const explicitPaths = new Set();
    const normalizedFiles = [];
    for (const file of files) {
        const normalizedPath = normalizeXacroPayloadPath(file.path);
        const normalizedKey = normalizedPath.toLowerCase();
        if (explicitPaths.has(normalizedKey))
            continue;
        explicitPaths.add(normalizedKey);
        normalizedFiles.push(normalizedPath === file.path
            ? file
            : {
                ...file,
                path: normalizedPath,
            });
    }
    const expandedFiles = [...normalizedFiles];
    const seenPaths = new Set(explicitPaths);
    for (const file of normalizedFiles) {
        for (const aliasPath of buildXacroPayloadPathAliases(file.path).slice(1)) {
            const aliasKey = aliasPath.toLowerCase();
            if (seenPaths.has(aliasKey))
                continue;
            seenPaths.add(aliasKey);
            expandedFiles.push({
                ...file,
                path: aliasPath,
            });
        }
    }
    return expandedFiles;
};
const buildXacroExpandRequestPayload = ({ targetPath, files, args, useInorder = true, }) => ({
    target_path: normalizeXacroPayloadPath(targetPath),
    files: expandXacroPayloadFiles(files),
    args: args ?? DEFAULT_XACRO_ARGS,
    use_inorder: useInorder,
});
exports.buildXacroExpandRequestPayload = buildXacroExpandRequestPayload;
const parseXacroExpandResponsePayload = (payload, emptyUrdfErrorMessage = exports.XACRO_EXPAND_EMPTY_URDF_ERROR) => {
    if (!payload?.urdf || payload.urdf.trim().length === 0) {
        throw new Error(emptyUrdfErrorMessage);
    }
    return {
        urdf: payload.urdf,
        stderr: payload.stderr ?? null,
    };
};
exports.parseXacroExpandResponsePayload = parseXacroExpandResponsePayload;

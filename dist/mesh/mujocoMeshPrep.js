"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MESH_COMPRESSION_MAX_FACES = exports.DEFAULT_MUJOCO_MAX_STL_FACES = void 0;
exports.inspectMeshes = inspectMeshes;
exports.compressMeshes = compressMeshes;
const fs = require("node:fs");
const path = require("node:path");
const stlBinary_1 = require("./stlBinary");
exports.DEFAULT_MUJOCO_MAX_STL_FACES = 200000;
exports.DEFAULT_MESH_COMPRESSION_MAX_FACES = exports.DEFAULT_MUJOCO_MAX_STL_FACES;
const listFilesRecursive = (rootDir) => {
    const results = [];
    const walk = (dirPath) => {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                walk(entryPath);
                continue;
            }
            if (entry.isFile()) {
                results.push(entryPath);
            }
        }
    };
    walk(rootDir);
    return results;
};
const normalizeRelativeMeshPath = (relativePath) => relativePath.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
const buildRequestedMeshSet = (meshes) => {
    if (!meshes || meshes.length === 0)
        return null;
    const normalized = meshes
        .map((mesh) => normalizeRelativeMeshPath(mesh))
        .filter((mesh) => mesh.length > 0)
        .map((mesh) => mesh.toLowerCase());
    return new Set(normalized);
};
const getTargetMaxFaces = (relativePath, defaultMaxFaces, limits) => {
    if (!limits)
        return defaultMaxFaces;
    const normalizedPath = normalizeRelativeMeshPath(relativePath).toLowerCase();
    for (const [rawPath, rawLimit] of Object.entries(limits)) {
        if (normalizeRelativeMeshPath(rawPath).toLowerCase() === normalizedPath) {
            const parsedLimit = Number(rawLimit);
            if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
                return parsedLimit;
            }
        }
    }
    return defaultMaxFaces;
};
function inspectMeshes(options) {
    const meshDir = path.resolve(options.meshDir);
    const maxFaces = options.maxFaces ?? exports.DEFAULT_MESH_COMPRESSION_MAX_FACES;
    const requestedMeshes = options.meshes?.map((mesh) => normalizeRelativeMeshPath(mesh)) ?? [];
    const requestedMeshSet = buildRequestedMeshSet(options.meshes);
    if (!fs.existsSync(meshDir) || !fs.statSync(meshDir).isDirectory()) {
        throw new Error(`Mesh directory does not exist: ${meshDir}`);
    }
    const results = [];
    let matched = 0;
    let overLimit = 0;
    const foundRequested = new Set();
    for (const absolutePath of listFilesRecursive(meshDir)) {
        const relativePath = normalizeRelativeMeshPath(path.relative(meshDir, absolutePath));
        const extension = path.extname(relativePath).toLowerCase();
        if (extension !== ".stl") {
            continue;
        }
        const normalizedLower = relativePath.toLowerCase();
        if (requestedMeshSet && !requestedMeshSet.has(normalizedLower)) {
            continue;
        }
        matched += 1;
        foundRequested.add(normalizedLower);
        const metadata = (0, stlBinary_1.inspectBinaryStlFile)(absolutePath);
        const targetMaxFaces = getTargetMaxFaces(relativePath, maxFaces, options.limits);
        const entry = {
            path: relativePath,
            format: "stl",
            faceCount: metadata.faceCount,
            byteLength: metadata.byteLength,
            isBinary: metadata.isBinary,
            targetMaxFaces,
            overLimit: false,
            reason: null,
        };
        if (!metadata.isBinary) {
            entry.reason = "Unsupported STL format. Expected a valid binary STL.";
            results.push(entry);
            continue;
        }
        entry.overLimit = metadata.faceCount > targetMaxFaces;
        if (entry.overLimit) {
            overLimit += 1;
            entry.reason = `Above target face limit: ${metadata.faceCount} > ${targetMaxFaces}.`;
        }
        results.push(entry);
    }
    const missingMeshes = requestedMeshes.filter((mesh) => !foundRequested.has(normalizeRelativeMeshPath(mesh).toLowerCase()));
    return {
        meshDir,
        maxFaces,
        inspected: results.length,
        matched,
        overLimit,
        requestedMeshes,
        missingMeshes,
        results,
    };
}
function compressMeshes(options) {
    const meshDir = path.resolve(options.meshDir);
    const outDir = options.outDir ? path.resolve(options.outDir) : undefined;
    const maxFaces = options.maxFaces ?? exports.DEFAULT_MESH_COMPRESSION_MAX_FACES;
    const shouldWrite = Boolean(options.inPlace || outDir);
    if (options.inPlace && outDir) {
        throw new Error("compressMeshes accepts either inPlace or outDir, not both.");
    }
    if (!fs.existsSync(meshDir) || !fs.statSync(meshDir).isDirectory()) {
        throw new Error(`Mesh directory does not exist: ${meshDir}`);
    }
    if (outDir) {
        fs.rmSync(outDir, { recursive: true, force: true });
        fs.cpSync(meshDir, outDir, { recursive: true });
    }
    const inspection = inspectMeshes({
        meshDir,
        maxFaces,
        meshes: options.meshes,
        limits: options.limits,
    });
    const results = [];
    let rewritten = 0;
    for (const inspectionEntry of inspection.results) {
        const absolutePath = path.join(meshDir, inspectionEntry.path);
        const targetPath = outDir ? path.join(outDir, inspectionEntry.path) : absolutePath;
        const entry = {
            path: inspectionEntry.path,
            format: "stl",
            faceCountBefore: inspectionEntry.faceCount,
            faceCountAfter: inspectionEntry.faceCount,
            changed: false,
            divisions: null,
            reason: inspectionEntry.reason,
        };
        if (!inspectionEntry.isBinary) {
            results.push(entry);
            continue;
        }
        if (inspectionEntry.overLimit) {
            if (shouldWrite) {
                const mesh = (0, stlBinary_1.readBinaryStl)(absolutePath);
                const simplified = (0, stlBinary_1.chooseSimplifiedBinaryStl)(mesh.triangles, inspectionEntry.targetMaxFaces);
                (0, stlBinary_1.writeBinaryStl)(targetPath, mesh.header, simplified.triangles);
                entry.faceCountAfter = simplified.faceCount;
                entry.changed = simplified.faceCount !== inspectionEntry.faceCount;
                entry.divisions = Number.isFinite(simplified.divisions) ? simplified.divisions : null;
                rewritten += entry.changed ? 1 : 0;
                if (simplified.faceCount > inspectionEntry.targetMaxFaces) {
                    entry.reason = `Still above target face limit after simplification: ${simplified.faceCount} > ${inspectionEntry.targetMaxFaces}.`;
                }
                else {
                    entry.reason = null;
                }
            }
        }
        results.push(entry);
    }
    return {
        meshDir,
        targetDir: outDir ?? (options.inPlace ? meshDir : null),
        maxFaces,
        inspected: inspection.inspected,
        overLimit: inspection.overLimit,
        rewritten,
        results,
    };
}

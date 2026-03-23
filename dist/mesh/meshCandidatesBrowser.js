"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMeshCandidates = void 0;
const meshFormats_1 = require("./meshFormats");
const meshResolverBrowser_1 = require("./meshResolverBrowser");
const buildMeshDecodeFallbackRefs = (meshRef) => {
    const cleaned = meshRef.split("?")[0]?.split("#")[0] ?? meshRef;
    const match = cleaned.match(/\.[^./\\]+$/);
    if (!match)
        return [];
    const currentExt = match[0].toLowerCase();
    const base = cleaned.slice(0, -match[0].length);
    return meshFormats_1.SUPPORTED_MESH_EXTENSIONS
        .filter((ext) => ext !== currentExt)
        .map((ext) => `${base}${ext}`);
};
const resolveMeshCandidates = (params) => {
    const { ref, meshFiles, urdfBasePath, packageRoots } = params;
    const refs = [ref, ...buildMeshDecodeFallbackRefs(ref)];
    const seen = new Set();
    const out = [];
    refs.forEach((candidateRef) => {
        const resolved = (0, meshResolverBrowser_1.resolveMeshBlobFromReference)(candidateRef, meshFiles, urdfBasePath, packageRoots);
        if (!resolved)
            return;
        if (seen.has(resolved.path))
            return;
        seen.add(resolved.path);
        out.push({
            ref: candidateRef,
            resolvedPath: resolved.path,
            blob: resolved.blob,
        });
    });
    return out;
};
exports.resolveMeshCandidates = resolveMeshCandidates;

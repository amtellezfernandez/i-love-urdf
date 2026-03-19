"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectRepositoryFiles = exports.inspectRepositoryCandidates = void 0;
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const repositoryUrdfDiscovery_1 = require("./repositoryUrdfDiscovery");
const meshFormats_1 = require("../mesh/meshFormats");
const meshPaths_1 = require("../mesh/meshPaths");
const toBaseInspection = (candidate) => ({
    ...candidate,
    inspectionMode: candidate.isXacro ? "xacro-source" : "urdf",
    referencedPackages: [],
});
const inspectRepositoryCandidate = async (candidate, files, readText) => {
    const file = files.find((entry) => entry.type === "file" && entry.path === candidate.path);
    const baseInspection = toBaseInspection(candidate);
    if (!file) {
        return baseInspection;
    }
    const text = await readText(candidate, file);
    const referencedPackages = Array.from(new Set([
        ...(0, repositoryUrdfDiscovery_1.collectPackageNamesFromText)(text),
        ...(candidate.isXacro ? [] : (0, repositoryUrdfDiscovery_1.collectMeshReferencedPackageNamesFromUrdf)(text)),
    ])).sort();
    if (candidate.isXacro) {
        return {
            ...baseInspection,
            referencedPackages,
        };
    }
    const packageRoots = (0, repositoryMeshResolution_1.buildPackageRootsFromRepositoryFiles)(files);
    const meshReferences = (0, repositoryUrdfDiscovery_1.extractMeshReferencesFromUrdf)(text);
    const { matchByReference } = (0, repositoryMeshResolution_1.resolveRepositoryMeshReferences)(candidate.path, text, files, {
        packageRoots,
    });
    const unmatchedMeshReferences = meshReferences.filter((meshRef) => {
        const refInfo = (0, meshPaths_1.parseMeshReference)(meshRef);
        const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(refInfo.path || refInfo.raw);
        const ext = (0, meshFormats_1.extractExtension)(normalized);
        return Boolean(ext && (0, meshFormats_1.isSupportedMeshExtension)(ext) && !matchByReference.has(meshRef));
    });
    const unsupported = (0, repositoryUrdfDiscovery_1.detectUnsupportedMeshFormats)(text);
    return {
        ...baseInspection,
        referencedPackages,
        hasRenderableGeometry: (0, repositoryUrdfDiscovery_1.hasRenderableUrdfGeometry)(text),
        meshReferenceCount: meshReferences.length,
        hasUnsupportedFormats: unsupported.hasUnsupported,
        unsupportedFormats: unsupported.hasUnsupported ? unsupported.formats : undefined,
        unmatchedMeshReferences: unmatchedMeshReferences.length > 0 ? unmatchedMeshReferences : undefined,
        unresolvedMeshReferenceCount: unmatchedMeshReferences.length,
    };
};
const inspectRepositoryCandidates = async (candidates, files, readText, options = {}) => {
    const maxCandidatesToInspect = Math.max(0, Number(options.maxCandidatesToInspect ?? 12) || 12);
    const concurrency = Math.max(1, Number(options.concurrency ?? 4) || 4);
    const candidatesToInspect = maxCandidatesToInspect > 0 ? candidates.slice(0, maxCandidatesToInspect) : [];
    const untouchedCandidates = candidates
        .slice(candidatesToInspect.length)
        .map((candidate) => toBaseInspection(candidate));
    const inspected = new Array(candidatesToInspect.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, candidatesToInspect.length) }, async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= candidatesToInspect.length)
                return;
            inspected[index] = await inspectRepositoryCandidate(candidatesToInspect[index], files, readText);
        }
    });
    await Promise.all(workers);
    return [...inspected, ...untouchedCandidates];
};
exports.inspectRepositoryCandidates = inspectRepositoryCandidates;
const inspectRepositoryFiles = async (files, readText, options = {}) => {
    const totalEntries = files.length;
    const totalFiles = files.filter((file) => file.type === "file").length;
    const candidates = (0, repositoryUrdfDiscovery_1.findRepositoryUrdfCandidates)(files).filter((candidate) => options.candidateFilter ? options.candidateFilter(candidate) : true);
    const inspectedCandidates = await (0, exports.inspectRepositoryCandidates)(candidates, files, readText, {
        maxCandidatesToInspect: options.maxCandidatesToInspect,
        concurrency: options.concurrency,
    });
    const maxCandidatesToInspect = Math.max(0, Number(options.maxCandidatesToInspect ?? 12) || 12);
    return {
        totalEntries,
        totalFiles,
        candidateCount: candidates.length,
        inspectedCandidateCount: Math.min(candidates.length, maxCandidatesToInspect),
        primaryCandidatePath: candidates[0]?.path ?? null,
        candidates: inspectedCandidates,
    };
};
exports.inspectRepositoryFiles = inspectRepositoryFiles;

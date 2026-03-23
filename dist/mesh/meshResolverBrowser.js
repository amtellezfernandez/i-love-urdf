"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripMeshSchemes = exports.resolveMeshResourceBlob = exports.resolveMeshBlobFromReference = exports.resolveMeshBlob = exports.buildPackageRootsFromMeshBlobMap = void 0;
const repositoryMeshResolution_1 = require("../repository/repositoryMeshResolution");
const meshPaths_1 = require("./meshPaths");
const fileNameIndexCache = new WeakMap();
const lowerCasePathIndexCache = new WeakMap();
const repositoryFilesCache = new WeakMap();
const inferredPackageRootsCache = new WeakMap();
const stripSchemes = (value) => value.replace(/^package:\/\/[^/]+\//, "").replace(/^file:\/\//, "");
const normalizeBasePath = (basePath) => basePath ? (0, meshPaths_1.normalizeMeshPathForMatch)(basePath) : "";
const addCandidate = (set, value) => {
    if (!value)
        return;
    const trimmed = value.trim();
    if (!trimmed)
        return;
    if (!set.has(trimmed)) {
        set.add(trimmed);
    }
    const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(trimmed);
    if (normalized && !set.has(normalized)) {
        set.add(normalized);
    }
    const noLeading = trimmed.replace(/^\/+/, "");
    if (noLeading && !set.has(noLeading)) {
        set.add(noLeading);
    }
    const normalizedNoLeading = (0, meshPaths_1.normalizeMeshPathForMatch)(noLeading);
    if (normalizedNoLeading && !set.has(normalizedNoLeading)) {
        set.add(normalizedNoLeading);
    }
};
const buildFileNameIndex = (meshFiles) => {
    const index = new Map();
    Object.entries(meshFiles).forEach(([path, blob]) => {
        const filename = path.split("/").pop() || path;
        const key = filename.toLowerCase();
        const entries = index.get(key);
        if (!entries) {
            index.set(key, [{ path, blob }]);
            return;
        }
        if (entries.some((entry) => entry.blob === blob))
            return;
        entries.push({ path, blob });
    });
    return index;
};
const buildLowerCasePathIndex = (meshFiles) => {
    const index = new Map();
    Object.entries(meshFiles).forEach(([path, blob]) => {
        const key = path.toLowerCase();
        if (!index.has(key)) {
            index.set(key, { path, blob });
        }
        const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(path);
        if (normalized) {
            const normalizedKey = normalized.toLowerCase();
            if (!index.has(normalizedKey)) {
                index.set(normalizedKey, { path, blob });
            }
        }
    });
    return index;
};
const getFileNameIndex = (meshFiles) => {
    const cached = fileNameIndexCache.get(meshFiles);
    if (cached)
        return cached;
    const index = buildFileNameIndex(meshFiles);
    fileNameIndexCache.set(meshFiles, index);
    return index;
};
const getLowerCasePathIndex = (meshFiles) => {
    const cached = lowerCasePathIndexCache.get(meshFiles);
    if (cached)
        return cached;
    const index = buildLowerCasePathIndex(meshFiles);
    lowerCasePathIndexCache.set(meshFiles, index);
    return index;
};
const getRepositoryFiles = (meshFiles) => {
    const cached = repositoryFilesCache.get(meshFiles);
    if (cached)
        return cached;
    const files = (0, repositoryMeshResolution_1.buildRepositoryFileEntriesFromPaths)(Object.keys(meshFiles));
    repositoryFilesCache.set(meshFiles, files);
    return files;
};
const buildPackageRootsFromMeshBlobMap = (meshFiles) => (0, repositoryMeshResolution_1.buildPackageRootsFromRepositoryFiles)(getRepositoryFiles(meshFiles));
exports.buildPackageRootsFromMeshBlobMap = buildPackageRootsFromMeshBlobMap;
const getInferredPackageRoots = (meshFiles) => {
    const cached = inferredPackageRootsCache.get(meshFiles);
    if (cached)
        return cached;
    const roots = (0, exports.buildPackageRootsFromMeshBlobMap)(meshFiles);
    inferredPackageRootsCache.set(meshFiles, roots);
    return roots;
};
const buildMeshPathCandidates = (rawPath, options = {}) => {
    const candidates = new Set();
    const allowSchemeStrip = options.allowSchemeStrip !== false;
    const allowDecode = options.allowDecode !== false;
    const normalizedBasePath = normalizeBasePath(options.basePath);
    const trimmed = rawPath.trim();
    const stripped = allowSchemeStrip ? stripSchemes(trimmed) : trimmed;
    const filename = stripped.split("/").pop() || stripped;
    const withoutFirstFolder = stripped.replace(/^.*?\//, "");
    if (normalizedBasePath) {
        addCandidate(candidates, `${normalizedBasePath}/${stripped}`);
        addCandidate(candidates, `${normalizedBasePath}/${filename}`);
    }
    addCandidate(candidates, trimmed);
    addCandidate(candidates, stripped);
    addCandidate(candidates, filename);
    addCandidate(candidates, withoutFirstFolder);
    const commonFolders = ["meshes", "mesh", "assets", "asset", "models", "model", "resources", "resource"];
    commonFolders.forEach((folder) => {
        addCandidate(candidates, `${folder}/${filename}`);
        addCandidate(candidates, `/${folder}/${filename}`);
    });
    if (allowDecode) {
        try {
            addCandidate(candidates, decodeURIComponent(trimmed));
            addCandidate(candidates, decodeURIComponent(stripped));
            addCandidate(candidates, decodeURIComponent(filename));
        }
        catch {
            // ignore decode errors
        }
    }
    return Array.from(candidates);
};
const buildUrdfRepositoryPath = (basePath) => {
    const normalizedBase = normalizeBasePath(basePath);
    return normalizedBase ? `${normalizedBase}/robot.urdf` : "robot.urdf";
};
const isUnderBasePath = (path, normalizedBasePath) => {
    if (!normalizedBasePath)
        return false;
    const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(path);
    if (!normalizedPath)
        return false;
    return (normalizedPath === normalizedBasePath ||
        normalizedPath.startsWith(`${normalizedBasePath}/`) ||
        normalizedBasePath.startsWith(`${normalizedPath}/`));
};
const pickFilenameFallbackMatch = (entries, basePath) => {
    if (!entries || entries.length === 0)
        return null;
    if (entries.length === 1)
        return entries[0];
    const normalizedBasePath = normalizeBasePath(basePath);
    if (!normalizedBasePath) {
        return null;
    }
    const scoped = entries.filter((entry) => isUnderBasePath(entry.path, normalizedBasePath));
    if (scoped.length === 1)
        return scoped[0];
    return null;
};
const resolveMeshBlob = (rawPath, meshFiles, options = {}) => {
    if (!meshFiles)
        return null;
    const candidates = buildMeshPathCandidates(rawPath, options);
    for (const candidate of candidates) {
        if (meshFiles[candidate]) {
            return { path: candidate, blob: meshFiles[candidate] };
        }
    }
    const lowerCaseIndex = getLowerCasePathIndex(meshFiles);
    for (const candidate of candidates) {
        const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(candidate);
        const lookup = normalized ? normalized.toLowerCase() : candidate.toLowerCase();
        const match = lowerCaseIndex.get(lookup);
        if (match)
            return match;
    }
    if (options.allowFilenameFallback === false) {
        return null;
    }
    const stripped = options.allowSchemeStrip === false ? rawPath : stripSchemes(rawPath);
    const filename = stripped.split("/").pop() || stripped;
    const index = getFileNameIndex(meshFiles);
    return pickFilenameFallbackMatch(index.get(filename.toLowerCase()), options.basePath);
};
exports.resolveMeshBlob = resolveMeshBlob;
const resolveMeshBlobFromReference = (meshRef, meshFiles, basePath, packageRoots) => {
    const refInfo = (0, meshPaths_1.parseMeshReference)(meshRef);
    if (refInfo.isAbsoluteFile) {
        return null;
    }
    if (!meshFiles)
        return null;
    const resolvedFile = (0, repositoryMeshResolution_1.resolveRepositoryFileReference)(buildUrdfRepositoryPath(basePath), meshRef, getRepositoryFiles(meshFiles), {
        packageRoots: packageRoots ?? getInferredPackageRoots(meshFiles),
    });
    if (resolvedFile) {
        const normalizedResolvedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(resolvedFile.path);
        if (normalizedResolvedPath) {
            const match = getLowerCasePathIndex(meshFiles).get(normalizedResolvedPath.toLowerCase());
            if (match) {
                return match;
            }
        }
    }
    const resolvedPath = refInfo.path || refInfo.raw;
    const normalizedBase = normalizeBasePath(basePath);
    return (0, exports.resolveMeshBlob)(resolvedPath, meshFiles, {
        allowSchemeStrip: true,
        basePath: normalizedBase,
    });
};
exports.resolveMeshBlobFromReference = resolveMeshBlobFromReference;
const resolveMeshResourceBlob = (uri, meshFiles, basePath) => {
    const cleaned = uri.split("?")[0]?.split("#")[0] ?? uri;
    if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("http")) {
        return null;
    }
    return (0, exports.resolveMeshBlob)(cleaned, meshFiles, {
        basePath,
        allowSchemeStrip: false,
    });
};
exports.resolveMeshResourceBlob = resolveMeshResourceBlob;
const stripMeshSchemes = (value) => stripSchemes(value);
exports.stripMeshSchemes = stripMeshSchemes;

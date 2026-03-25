"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRepositoryMeshReferences = exports.resolveRepositoryFileReference = exports.buildPackageRootsFromRepositoryFiles = exports.collectXacroSupportFilesFromRepository = exports.resolveMeshPathInRepository = exports.repositoryDirname = exports.buildRepositoryFileEntriesFromPaths = exports.extractPackageNameFromPackageXml = exports.normalizeRepositoryPath = void 0;
const analyzeUrdf_1 = require("../analysis/analyzeUrdf");
const meshFormats_1 = require("../mesh/meshFormats");
const meshPaths_1 = require("../mesh/meshPaths");
const xacroContract_1 = require("../xacro/xacroContract");
const COMMON_PACKAGE_FOLDERS = new Set([
    "meshes",
    "mesh",
    "assets",
    "asset",
    "resources",
    "resource",
    "urdf",
    "xml",
    "models",
    "model",
    "visual",
    "collision",
    "textures",
    "texture",
    "materials",
    "material",
]);
const normalizeRepositoryPath = (path) => {
    if (!path)
        return "";
    return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
};
exports.normalizeRepositoryPath = normalizeRepositoryPath;
const extractPackageNameFromPackageXml = (content) => {
    const match = content.match(/<name>\s*([^<]+)\s*<\/name>/i);
    const packageName = match?.[1]?.trim() ?? "";
    return packageName || null;
};
exports.extractPackageNameFromPackageXml = extractPackageNameFromPackageXml;
const buildRepositoryFileEntriesFromPaths = (paths) => {
    const files = new Map();
    for (const path of paths) {
        const normalized = (0, exports.normalizeRepositoryPath)(path);
        if (!normalized)
            continue;
        files.set(normalized, { path: normalized, type: "file" });
    }
    return Array.from(files.values()).sort((left, right) => left.path.localeCompare(right.path));
};
exports.buildRepositoryFileEntriesFromPaths = buildRepositoryFileEntriesFromPaths;
const repositoryDirname = (path) => {
    const lastSlashIndex = path.lastIndexOf("/");
    return lastSlashIndex >= 0 ? path.substring(0, lastSlashIndex) : "";
};
exports.repositoryDirname = repositoryDirname;
const resolveMeshPath = (urdfDir, meshRef) => {
    const refInfo = (0, meshPaths_1.parseMeshReference)(meshRef);
    if (refInfo.isAbsoluteFile) {
        return "";
    }
    const path = (0, meshPaths_1.normalizeMeshPathForMatch)(refInfo.path || refInfo.raw);
    if (!path) {
        return "";
    }
    if (!urdfDir) {
        return (0, exports.normalizeRepositoryPath)(path);
    }
    const urdfParts = urdfDir.split("/").filter(Boolean);
    const meshParts = path.split("/").filter(Boolean);
    const resolvedParts = [...urdfParts];
    for (const part of meshParts) {
        if (part === "..") {
            if (resolvedParts.length > 0) {
                resolvedParts.pop();
            }
        }
        else if (part !== "." && part !== "") {
            resolvedParts.push(part);
        }
    }
    return (0, exports.normalizeRepositoryPath)(resolvedParts.join("/"));
};
const startsWithMeshFolder = (meshRef) => {
    const lower = meshRef.toLowerCase();
    return (lower.startsWith("meshes/") ||
        lower.startsWith("meshes\\") ||
        lower.startsWith("assets/") ||
        lower.startsWith("assets\\"));
};
const tryResolveFromParent = (urdfDir, meshRef, lowerCaseFileMap) => {
    const urdfDirParts = urdfDir.split("/").filter(Boolean);
    if (urdfDirParts.length === 0)
        return null;
    const parentDir = urdfDirParts.slice(0, -1).join("/");
    const hasMeshPrefix = startsWithMeshFolder(meshRef);
    if (hasMeshPrefix) {
        const resolved = resolveMeshPath(parentDir, meshRef);
        if (resolved) {
            const file = lowerCaseFileMap.get(resolved.toLowerCase());
            if (file) {
                return file;
            }
        }
    }
    else {
        for (const folderName of ["meshes", "assets"]) {
            const meshRefWithFolder = `${folderName}/${meshRef}`;
            const resolved = resolveMeshPath(parentDir, meshRefWithFolder);
            if (resolved) {
                const file = lowerCaseFileMap.get(resolved.toLowerCase());
                if (file) {
                    return file;
                }
            }
        }
    }
    return null;
};
const resolveMeshPathInRepository = (urdfPath, meshRef, lowerCaseFileMap) => {
    const urdfDir = (0, exports.repositoryDirname)(urdfPath);
    const resolved = resolveMeshPath(urdfDir, meshRef);
    if (!resolved) {
        return null;
    }
    let file = lowerCaseFileMap.get(resolved.toLowerCase());
    if (file) {
        return file;
    }
    if (urdfDir) {
        file = tryResolveFromParent(urdfDir, meshRef, lowerCaseFileMap);
        if (file) {
            return file;
        }
    }
    return null;
};
exports.resolveMeshPathInRepository = resolveMeshPathInRepository;
const collectXacroSupportFilesFromRepository = (files, targetPath) => {
    const supportFiles = files.filter((file) => file.type === "file" && (0, xacroContract_1.isXacroSupportPath)(file.path));
    const normalizedTarget = (0, meshPaths_1.normalizeMeshPathForMatch)(targetPath);
    const hasTarget = supportFiles.some((file) => (0, meshPaths_1.normalizeMeshPathForMatch)(file.path) === normalizedTarget);
    if (hasTarget) {
        return supportFiles;
    }
    const targetFile = files.find((file) => file.type === "file" && file.path === targetPath);
    return targetFile ? [...supportFiles, targetFile] : supportFiles;
};
exports.collectXacroSupportFilesFromRepository = collectXacroSupportFilesFromRepository;
const getPackageNameOverride = (packageNameByPath, path) => {
    if (!packageNameByPath)
        return null;
    const normalizedPath = (0, exports.normalizeRepositoryPath)(path);
    if (packageNameByPath instanceof Map) {
        return packageNameByPath.get(normalizedPath)?.trim() || packageNameByPath.get(path)?.trim() || null;
    }
    return packageNameByPath[normalizedPath]?.trim() || packageNameByPath[path]?.trim() || null;
};
const buildPackageRootsFromRepositoryFiles = (files, options = {}) => {
    const roots = new Map();
    const addRoot = (packageName, rootPath) => {
        if (!packageName)
            return;
        let entry = roots.get(packageName);
        if (!entry) {
            entry = new Set();
            roots.set(packageName, entry);
        }
        entry.add(rootPath);
    };
    files.forEach((file) => {
        if (file.type !== "file")
            return;
        const lowerPath = file.path.toLowerCase();
        if (lowerPath === "package.xml" || lowerPath.endsWith("/package.xml")) {
            const rootPath = (0, exports.repositoryDirname)(file.path);
            const parts = rootPath.split("/").filter(Boolean);
            const packageName = getPackageNameOverride(options.packageNameByPath, file.path) ?? parts[parts.length - 1];
            if (packageName) {
                addRoot(packageName, rootPath);
            }
            return;
        }
        const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(file.path);
        if (!normalized)
            return;
        const parts = normalized.split("/").filter(Boolean);
        for (let i = 0; i < parts.length - 1; i++) {
            const folder = parts[i + 1]?.toLowerCase();
            if (!folder || !COMMON_PACKAGE_FOLDERS.has(folder))
                continue;
            const packageName = parts[i];
            if (!packageName)
                continue;
            const rootPath = parts.slice(0, i + 1).join("/");
            addRoot(packageName, rootPath);
        }
    });
    const output = {};
    roots.forEach((set, name) => {
        output[name] = Array.from(set);
    });
    return output;
};
exports.buildPackageRootsFromRepositoryFiles = buildPackageRootsFromRepositoryFiles;
const parseMeshDirOverride = (urdfText) => {
    const match = urdfText.match(/<compiler[^>]*meshdir=["']([^"']+)["'][^>]*>/i);
    const meshDir = match?.[1]?.trim() ?? "";
    return (0, meshPaths_1.normalizeMeshPathForMatch)(meshDir);
};
const buildExtensionCandidates = (path, supportedMeshExtensions) => {
    const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(path);
    if (!normalized)
        return [];
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0)
        return [];
    const filename = parts.pop() ?? normalized;
    const match = filename.match(/^(.*?)(\.[^.]+)?$/);
    const baseName = match?.[1] ?? filename;
    const prefix = parts.length > 0 ? `${parts.join("/")}/` : "";
    return supportedMeshExtensions.map((ext) => `${prefix}${baseName}${ext}`);
};
const findFileByCandidates = (candidates, lowerCaseFileMap) => {
    for (const candidate of candidates) {
        const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(candidate);
        if (!normalized)
            continue;
        const match = lowerCaseFileMap.get(normalized.toLowerCase());
        if (match)
            return match;
    }
    return null;
};
const getPackageRootCandidates = (packageName, packageRoots, urdfPath) => {
    const roots = new Set();
    const direct = packageRoots[packageName] ?? [];
    direct.forEach((root) => {
        roots.add(root === "" ? "" : (0, meshPaths_1.normalizeMeshPathForMatch)(root));
    });
    const urdfParts = (0, meshPaths_1.normalizeMeshPathForMatch)(urdfPath).split("/").filter(Boolean);
    const index = urdfParts.indexOf(packageName);
    if (index !== -1) {
        roots.add(urdfParts.slice(0, index + 1).join("/"));
    }
    return Array.from(roots);
};
const resolveRepositoryFileReference = (urdfPath, meshRef, files, options) => {
    if (!meshRef)
        return null;
    if (meshRef.startsWith("http://") ||
        meshRef.startsWith("https://") ||
        meshRef.startsWith("data:")) {
        return null;
    }
    const lowerCaseFileMap = new Map();
    files.forEach((file) => {
        if (file.type !== "file")
            return;
        const normalized = (0, exports.normalizeRepositoryPath)(file.path);
        lowerCaseFileMap.set(normalized.toLowerCase(), file);
    });
    const packageRoots = options?.packageRoots ?? (0, exports.buildPackageRootsFromRepositoryFiles)(files);
    const supportedMeshExtensions = options?.supportedMeshExtensions ?? meshFormats_1.SUPPORTED_MESH_EXTENSIONS;
    const meshDirOverride = (0, meshPaths_1.normalizeMeshPathForMatch)(options?.meshDirOverride ?? "");
    const urdfDir = (0, exports.repositoryDirname)(urdfPath);
    const parentDir = (0, exports.repositoryDirname)(urdfDir);
    const refInfo = (0, meshPaths_1.parseMeshReference)(meshRef);
    if (refInfo.isAbsoluteFile) {
        return null;
    }
    const rawPath = refInfo.path || refInfo.raw;
    const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(rawPath);
    const candidates = [];
    const addCandidate = (candidate) => {
        if (!candidate)
            return;
        if (!candidates.includes(candidate))
            candidates.push(candidate);
    };
    if (refInfo.scheme === "package" && refInfo.packageName) {
        const roots = getPackageRootCandidates(refInfo.packageName, packageRoots, urdfPath);
        roots.forEach((root) => {
            const combined = normalizedPath ? `${root}/${normalizedPath}` : `${root}/${rawPath}`;
            addCandidate(combined);
        });
        if (normalizedPath) {
            addCandidate(`${urdfDir}/${normalizedPath}`);
            if (parentDir) {
                addCandidate(`${parentDir}/${normalizedPath}`);
            }
            if (normalizedPath.startsWith("meshes/") || normalizedPath.startsWith("assets/")) {
                if (parentDir) {
                    addCandidate(`${parentDir}/${normalizedPath}`);
                }
            }
            if (!normalizedPath.includes("/")) {
                addCandidate(`${urdfDir}/meshes/${normalizedPath}`);
                addCandidate(`${urdfDir}/assets/${normalizedPath}`);
                if (parentDir) {
                    addCandidate(`${parentDir}/meshes/${normalizedPath}`);
                    addCandidate(`${parentDir}/assets/${normalizedPath}`);
                }
            }
        }
    }
    else {
        const combined = normalizedPath ? `${urdfDir}/${normalizedPath}` : `${urdfDir}/${rawPath}`;
        addCandidate(combined);
        if (meshDirOverride) {
            addCandidate(`${urdfDir}/${meshDirOverride}/${normalizedPath || rawPath}`);
        }
        if (normalizedPath &&
            (normalizedPath.startsWith("meshes/") || normalizedPath.startsWith("assets/"))) {
            addCandidate(`${parentDir}/${normalizedPath}`);
        }
        if (normalizedPath && !normalizedPath.includes("/")) {
            addCandidate(`${urdfDir}/meshes/${normalizedPath}`);
            addCandidate(`${urdfDir}/assets/${normalizedPath}`);
            if (parentDir) {
                addCandidate(`${parentDir}/meshes/${normalizedPath}`);
                addCandidate(`${parentDir}/assets/${normalizedPath}`);
            }
        }
    }
    addCandidate(normalizedPath || rawPath);
    let file = findFileByCandidates(candidates, lowerCaseFileMap);
    if (!file && (normalizedPath || rawPath)) {
        const extensionCandidates = buildExtensionCandidates(normalizedPath || rawPath, supportedMeshExtensions);
        const expanded = [];
        candidates.forEach((candidate) => {
            expanded.push(...buildExtensionCandidates(candidate, supportedMeshExtensions));
        });
        file = findFileByCandidates([...extensionCandidates, ...expanded], lowerCaseFileMap);
    }
    return file;
};
exports.resolveRepositoryFileReference = resolveRepositoryFileReference;
const resolveRepositoryMeshReferences = (urdfPath, urdfText, files, options) => {
    const meshReferences = (0, analyzeUrdf_1.analyzeUrdf)(urdfText).meshReferences;
    const packageRoots = options?.packageRoots ?? (0, exports.buildPackageRootsFromRepositoryFiles)(files);
    const supportedMeshExtensions = options?.supportedMeshExtensions ?? meshFormats_1.SUPPORTED_MESH_EXTENSIONS;
    const meshDirOverride = parseMeshDirOverride(urdfText);
    const urdfDir = (0, exports.repositoryDirname)(urdfPath);
    const parentDir = (0, exports.repositoryDirname)(urdfDir);
    const matches = [];
    const matchByReference = new Map();
    const unresolved = [];
    const seenPaths = new Set();
    const addMatch = (ref, file) => {
        matchByReference.set(ref, file);
        if (!seenPaths.has(file.path)) {
            matches.push(file);
            seenPaths.add(file.path);
        }
    };
    for (const meshRef of meshReferences) {
        if (!meshRef)
            continue;
        if (meshRef.startsWith("http://") ||
            meshRef.startsWith("https://") ||
            meshRef.startsWith("data:")) {
            continue;
        }
        const file = (0, exports.resolveRepositoryFileReference)(urdfPath, meshRef, files, {
            packageRoots,
            supportedMeshExtensions,
            meshDirOverride,
        });
        if (file) {
            addMatch(meshRef, file);
        }
        else {
            unresolved.push(meshRef);
        }
    }
    return { matches, matchByReference, unresolved };
};
exports.resolveRepositoryMeshReferences = resolveRepositoryMeshReferences;

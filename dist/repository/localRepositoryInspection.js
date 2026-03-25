"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairLocalRepositoryMeshReferences = exports.inspectLocalRepositoryUrdfs = exports.collectLocalRepositoryFiles = exports.resolveLocalRepositoryFile = exports.resolveLocalRepositoryReference = exports.resolveLocalRepositoryScopedFile = void 0;
const fs = require("node:fs/promises");
const path = require("node:path");
const fixMissingMeshReferences_1 = require("./fixMissingMeshReferences");
const repositoryInspection_1 = require("./repositoryInspection");
const repositoryPackageNames_1 = require("./repositoryPackageNames");
const repositoryPathScope_1 = require("./repositoryPathScope");
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const LOCAL_REPOSITORY_SKIPPED_DIRS = new Set([
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
]);
const isSkippableWalkError = (error) => {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return code === "EACCES" || code === "EPERM" || code === "ENOENT";
};
const readDirectoryEntries = async (absolutePath, { allowSkip = true } = {}) => {
    try {
        return await fs.readdir(absolutePath, { withFileTypes: true });
    }
    catch (error) {
        if (allowSkip && isSkippableWalkError(error)) {
            return null;
        }
        throw error;
    }
};
const readFileStats = async (absolutePath, { allowSkip = true } = {}) => {
    try {
        return await fs.stat(absolutePath);
    }
    catch (error) {
        if (allowSkip && isSkippableWalkError(error)) {
            return null;
        }
        throw error;
    }
};
const pathExists = async (absolutePath) => {
    try {
        await fs.access(absolutePath);
        return true;
    }
    catch (error) {
        if (isSkippableWalkError(error)) {
            return false;
        }
        throw error;
    }
};
const findNearestLocalRepositoryRoot = async (startPath) => {
    let currentPath = path.resolve(startPath);
    while (true) {
        if (await pathExists(path.join(currentPath, "package.xml"))) {
            return currentPath;
        }
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
    currentPath = path.resolve(startPath);
    while (true) {
        if (await pathExists(path.join(currentPath, ".git"))) {
            return currentPath;
        }
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
    return path.resolve(startPath);
};
const resolveLocalRepositoryScopedFile = async (rootPath, scopedBasePath, requestedPath, messages) => {
    const normalizedRequestedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(requestedPath);
    if (!normalizedRequestedPath) {
        throw new Error(messages.outsideRoot);
    }
    const absoluteRequestedPath = path.resolve(scopedBasePath, requestedPath);
    const [realRootPath, realTargetPath] = await Promise.all([
        fs.realpath(rootPath),
        fs.realpath(absoluteRequestedPath),
    ]);
    const canonicalRelativePath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(realRootPath, realTargetPath));
    if (!canonicalRelativePath || canonicalRelativePath.startsWith("..")) {
        throw new Error(messages.outsideRoot);
    }
    const stats = await readFileStats(realTargetPath, { allowSkip: false });
    if (!stats.isFile()) {
        throw new Error(messages.notFile(realTargetPath));
    }
    return {
        filePath: canonicalRelativePath,
        absolutePath: realTargetPath,
    };
};
exports.resolveLocalRepositoryScopedFile = resolveLocalRepositoryScopedFile;
const resolveLocalRepositoryReference = async (reference) => {
    const inspectedPath = path.resolve(reference.path);
    const stats = await readFileStats(inspectedPath, { allowSkip: false });
    const scopedBasePath = stats.isDirectory() ? inspectedPath : path.dirname(inspectedPath);
    const rootPath = await findNearestLocalRepositoryRoot(scopedBasePath);
    const scopePath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, inspectedPath));
    const scope = stats.isDirectory()
        ? scopePath
            ? {
                kind: "dir",
                path: scopePath,
            }
            : {
                kind: "root",
                path: "",
            }
        : {
            kind: "file",
            path: scopePath || path.basename(inspectedPath),
        };
    return { inspectedPath, scopedBasePath, scope, stats, rootPath };
};
exports.resolveLocalRepositoryReference = resolveLocalRepositoryReference;
const resolveLocalRepositoryFile = async (rootPath, requestedPath, messages) => (0, exports.resolveLocalRepositoryScopedFile)(rootPath, rootPath, requestedPath, messages);
exports.resolveLocalRepositoryFile = resolveLocalRepositoryFile;
const walkLocalRepository = async (absoluteRootPath, currentAbsolutePath, entries) => {
    const dirEntries = await readDirectoryEntries(currentAbsolutePath, {
        allowSkip: currentAbsolutePath !== absoluteRootPath,
    });
    if (!dirEntries) {
        return;
    }
    for (const dirEntry of dirEntries) {
        const absolutePath = path.join(currentAbsolutePath, dirEntry.name);
        const relativePath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(absoluteRootPath, absolutePath));
        if (dirEntry.isDirectory()) {
            if (LOCAL_REPOSITORY_SKIPPED_DIRS.has(dirEntry.name)) {
                continue;
            }
            entries.push({
                name: dirEntry.name,
                path: relativePath,
                type: "dir",
                absolutePath,
            });
            await walkLocalRepository(absoluteRootPath, absolutePath, entries);
            continue;
        }
        if (!dirEntry.isFile()) {
            continue;
        }
        const stats = await readFileStats(absolutePath);
        if (!stats) {
            continue;
        }
        entries.push({
            name: dirEntry.name,
            path: relativePath,
            type: "file",
            absolutePath,
            size: stats.size,
        });
    }
};
const collectLocalRepositoryFiles = async (absoluteRootPath) => {
    const entries = [];
    await walkLocalRepository(absoluteRootPath, absoluteRootPath, entries);
    return entries;
};
exports.collectLocalRepositoryFiles = collectLocalRepositoryFiles;
const resolveLocalRepositoryTarget = async (reference, requestedUrdfPath) => {
    const { inspectedPath, scopedBasePath, scope, stats, rootPath } = await (0, exports.resolveLocalRepositoryReference)(reference);
    const { filePath: normalizedUrdfPath, absolutePath: absoluteUrdfPath } = requestedUrdfPath
        ? await (0, exports.resolveLocalRepositoryScopedFile)(rootPath, scopedBasePath, requestedUrdfPath, {
            outsideRoot: "Target URDF must stay inside the local repository root.",
            notFile: (absolutePath) => `Local repository target is not a file: ${absolutePath}`,
        })
        : await (() => {
            if (stats.isDirectory()) {
                throw new Error("Local repository repair requires --urdf when --local points to a directory.");
            }
            if (scope.kind !== "file") {
                throw new Error("Local repository repair could not resolve the selected URDF file.");
            }
            return Promise.resolve({
                filePath: scope.path,
                absolutePath: inspectedPath,
            });
        })();
    const [files, urdfContent] = await Promise.all([
        (0, exports.collectLocalRepositoryFiles)(rootPath),
        fs.readFile(absoluteUrdfPath, "utf8"),
    ]);
    return {
        files,
        rootPath,
        inspectedPath,
        urdfPath: normalizedUrdfPath,
        urdfContent,
    };
};
const inspectLocalRepositoryUrdfs = async (reference, options = {}) => {
    const { inspectedPath, scope, rootPath } = await (0, exports.resolveLocalRepositoryReference)(reference);
    const files = await (0, exports.collectLocalRepositoryFiles)(rootPath);
    const packageNameByPath = await (0, repositoryPackageNames_1.buildPackageNameByPathFromRepositoryFiles)(files, async (file) => fs.readFile(file.absolutePath, "utf8"));
    const summary = await (0, repositoryInspection_1.inspectRepositoryFiles)(files, async (_candidate, file) => fs.readFile(file.absolutePath, "utf8"), {
        ...options,
        packageNameByPath,
        candidateFilter: (candidate) => {
            const matchesLocalTarget = (0, repositoryPathScope_1.matchesRepositoryScope)(candidate.path, scope);
            const matchesCallerFilter = options.candidateFilter ? options.candidateFilter(candidate) : true;
            return matchesLocalTarget && matchesCallerFilter;
        },
    });
    return {
        source: "local",
        rootPath,
        inspectedPath,
        ...summary,
    };
};
exports.inspectLocalRepositoryUrdfs = inspectLocalRepositoryUrdfs;
const repairLocalRepositoryMeshReferences = async (reference, options = {}) => {
    const { files, rootPath, inspectedPath, urdfPath, urdfContent } = await resolveLocalRepositoryTarget(reference, options.urdfPath);
    const packageNameByPath = await (0, repositoryPackageNames_1.buildPackageNameByPathFromRepositoryFiles)(files, async (file) => fs.readFile(file.absolutePath, "utf8"));
    const result = (0, fixMissingMeshReferences_1.fixMissingMeshReferencesInRepository)(urdfContent, urdfPath, files, {
        ...options,
        packageNameByPath,
        normalizeResolvableReferences: options.normalizeResolvableReferences ?? true,
    });
    return {
        source: "local",
        rootPath,
        inspectedPath,
        urdfPath,
        ...result,
    };
};
exports.repairLocalRepositoryMeshReferences = repairLocalRepositoryMeshReferences;

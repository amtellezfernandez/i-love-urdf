"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairLocalRepositoryMeshReferences = exports.inspectLocalRepositoryUrdfs = exports.collectLocalRepositoryFiles = exports.resolveLocalRepositoryFile = void 0;
const fs = require("node:fs/promises");
const path = require("node:path");
const fixMissingMeshReferences_1 = require("./fixMissingMeshReferences");
const repositoryInspection_1 = require("./repositoryInspection");
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
const resolveLocalRepositoryReference = async (reference) => {
    const inspectedPath = path.resolve(reference.path);
    const stats = await readFileStats(inspectedPath, { allowSkip: false });
    const rootPath = stats.isDirectory() ? inspectedPath : path.dirname(inspectedPath);
    return { inspectedPath, stats, rootPath };
};
const resolveLocalRepositoryFile = async (rootPath, requestedPath, messages) => {
    const normalizedRequestedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(requestedPath);
    if (!normalizedRequestedPath || normalizedRequestedPath.startsWith("..")) {
        throw new Error(messages.outsideRoot);
    }
    const absoluteRequestedPath = path.resolve(rootPath, normalizedRequestedPath);
    const lexicalRelativePath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, absoluteRequestedPath));
    if (!lexicalRelativePath || lexicalRelativePath.startsWith("..")) {
        throw new Error(messages.outsideRoot);
    }
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
    const { inspectedPath, stats, rootPath } = await resolveLocalRepositoryReference(reference);
    const { filePath: normalizedUrdfPath, absolutePath: absoluteUrdfPath } = stats.isDirectory()
        ? await (() => {
            if (!requestedUrdfPath) {
                throw new Error("Local repository repair requires --urdf when --local points to a directory.");
            }
            return (0, exports.resolveLocalRepositoryFile)(rootPath, requestedUrdfPath, {
                outsideRoot: "Target URDF must stay inside the local repository root.",
                notFile: (absolutePath) => `Local repository target is not a file: ${absolutePath}`,
            });
        })()
        : {
            filePath: (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.basename(inspectedPath)),
            absolutePath: inspectedPath,
        };
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
    const { inspectedPath, stats, rootPath } = await resolveLocalRepositoryReference(reference);
    const candidateFilter = stats.isFile()
        ? (candidatePath) => (0, repositoryMeshResolution_1.normalizeRepositoryPath)(candidatePath) ===
            (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, inspectedPath))
        : null;
    const files = await (0, exports.collectLocalRepositoryFiles)(rootPath);
    const summary = await (0, repositoryInspection_1.inspectRepositoryFiles)(files, async (_candidate, file) => fs.readFile(file.absolutePath, "utf8"), {
        ...options,
        candidateFilter: (candidate) => {
            const matchesLocalTarget = candidateFilter ? candidateFilter(candidate.path) : true;
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
    const result = (0, fixMissingMeshReferences_1.fixMissingMeshReferencesInRepository)(urdfContent, urdfPath, files, options);
    return {
        source: "local",
        rootPath,
        inspectedPath,
        urdfPath,
        ...result,
    };
};
exports.repairLocalRepositoryMeshReferences = repairLocalRepositoryMeshReferences;

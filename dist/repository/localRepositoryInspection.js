"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairLocalRepositoryMeshReferences = exports.inspectLocalRepositoryUrdfs = exports.collectLocalRepositoryFiles = void 0;
const fs = require("node:fs/promises");
const path = require("node:path");
const fixMissingMeshReferences_1 = require("./fixMissingMeshReferences");
const repositoryInspection_1 = require("./repositoryInspection");
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const walkLocalRepository = async (absoluteRootPath, currentAbsolutePath, entries) => {
    const dirEntries = await fs.readdir(currentAbsolutePath, { withFileTypes: true });
    for (const dirEntry of dirEntries) {
        const absolutePath = path.join(currentAbsolutePath, dirEntry.name);
        const relativePath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(absoluteRootPath, absolutePath));
        if (dirEntry.isDirectory()) {
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
        const stats = await fs.stat(absolutePath);
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
    const inspectedPath = path.resolve(reference.path);
    const stats = await fs.stat(inspectedPath);
    const rootPath = stats.isDirectory() ? inspectedPath : path.dirname(inspectedPath);
    const absoluteUrdfPath = stats.isDirectory()
        ? (() => {
            if (!requestedUrdfPath) {
                throw new Error("Local repository repair requires --urdf when --local points to a directory.");
            }
            return path.resolve(rootPath, requestedUrdfPath);
        })()
        : inspectedPath;
    const normalizedUrdfPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, absoluteUrdfPath));
    if (!normalizedUrdfPath || normalizedUrdfPath.startsWith("..")) {
        throw new Error("Target URDF must stay inside the local repository root.");
    }
    const urdfStats = await fs.stat(absoluteUrdfPath);
    if (!urdfStats.isFile()) {
        throw new Error(`Local repository target is not a file: ${absoluteUrdfPath}`);
    }
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
    const inspectedPath = path.resolve(reference.path);
    const stats = await fs.stat(inspectedPath);
    const absoluteRootPath = stats.isDirectory() ? inspectedPath : path.dirname(inspectedPath);
    const candidateFilter = stats.isFile()
        ? (candidatePath) => (0, repositoryMeshResolution_1.normalizeRepositoryPath)(candidatePath) ===
            (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(absoluteRootPath, inspectedPath))
        : null;
    const files = await (0, exports.collectLocalRepositoryFiles)(absoluteRootPath);
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
        rootPath: absoluteRootPath,
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

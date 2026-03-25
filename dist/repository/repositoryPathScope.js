"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRepositoryScopedPathFromFiles = exports.resolveRepositoryScopeFromFiles = exports.matchesRepositoryScope = void 0;
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const matchesRepositoryScope = (repositoryPath, scope) => {
    if (scope.kind === "root") {
        return true;
    }
    const normalizedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(repositoryPath);
    if (!normalizedPath) {
        return false;
    }
    if (scope.kind === "file") {
        return normalizedPath === scope.path;
    }
    return normalizedPath === scope.path || normalizedPath.startsWith(`${scope.path}/`);
};
exports.matchesRepositoryScope = matchesRepositoryScope;
const resolveRepositoryScopeFromFiles = (files, requestedPath) => {
    const normalizedRequestedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(requestedPath || "");
    if (!normalizedRequestedPath) {
        return {
            kind: "root",
            path: "",
        };
    }
    const exactFile = files.find((file) => file.type === "file" && (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path) === normalizedRequestedPath);
    if (exactFile) {
        return {
            kind: "file",
            path: exactFile.path,
        };
    }
    const exactDirectory = files.find((file) => file.type === "dir" && (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path) === normalizedRequestedPath);
    if (exactDirectory) {
        return {
            kind: "dir",
            path: exactDirectory.path,
        };
    }
    const hasDescendants = files.some((file) => (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path).startsWith(`${normalizedRequestedPath}/`));
    if (!hasDescendants) {
        return null;
    }
    return {
        kind: "dir",
        path: normalizedRequestedPath,
    };
};
exports.resolveRepositoryScopeFromFiles = resolveRepositoryScopeFromFiles;
const resolveRepositoryScopedPathFromFiles = (files, scope, requestedPath) => {
    const normalizedRequestedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(requestedPath || "");
    if (!normalizedRequestedPath) {
        return "";
    }
    const exactScope = (0, exports.resolveRepositoryScopeFromFiles)(files, normalizedRequestedPath);
    if (exactScope?.kind === "file") {
        return exactScope.path;
    }
    if (scope.kind === "dir") {
        const scopedCandidatePath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(`${scope.path}/${normalizedRequestedPath}`);
        const scopedCandidate = (0, exports.resolveRepositoryScopeFromFiles)(files, scopedCandidatePath);
        if (scopedCandidate?.kind === "file") {
            return scopedCandidate.path;
        }
    }
    if (scope.kind === "file") {
        const scopeBasename = scope.path.split("/").pop() || scope.path;
        if (scopeBasename === normalizedRequestedPath) {
            return scope.path;
        }
    }
    return normalizedRequestedPath;
};
exports.resolveRepositoryScopedPathFromFiles = resolveRepositoryScopedPathFromFiles;

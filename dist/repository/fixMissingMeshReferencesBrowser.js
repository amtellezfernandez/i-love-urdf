"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixMissingMeshReferences = void 0;
const meshPaths_1 = require("../mesh/meshPaths");
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const fixMissingMeshReferences_1 = require("./fixMissingMeshReferences");
const fixMissingMeshReferences = (urdfContent, meshFiles, options = {}) => {
    if (!urdfContent.trim()) {
        return {
            success: false,
            content: urdfContent,
            corrections: [],
            unresolved: [],
            error: "Empty URDF",
        };
    }
    if (!meshFiles || Object.keys(meshFiles).length === 0) {
        return {
            success: false,
            content: urdfContent,
            corrections: [],
            unresolved: [],
            error: "No mesh files available",
        };
    }
    const normalizedBasePath = (0, meshPaths_1.normalizeMeshPathForMatch)(options.basePath ?? "");
    const urdfPath = normalizedBasePath ? `${normalizedBasePath}/robot.urdf` : "robot.urdf";
    const repositoryFiles = (0, repositoryMeshResolution_1.buildRepositoryFileEntriesFromPaths)([
        urdfPath,
        ...Object.keys(meshFiles),
    ]);
    return (0, fixMissingMeshReferences_1.fixMissingMeshReferencesInRepository)(urdfContent, urdfPath, repositoryFiles, {
        packageRoots: options.packageRoots,
    });
};
exports.fixMissingMeshReferences = fixMissingMeshReferences;

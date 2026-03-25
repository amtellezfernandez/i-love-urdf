"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPackageNameByPathFromRepositoryFiles = void 0;
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const buildPackageNameByPathFromRepositoryFiles = async (files, readText) => {
    const overrides = {};
    for (const file of files) {
        if (file.type !== "file" || !file.path.toLowerCase().endsWith("/package.xml") && file.path.toLowerCase() !== "package.xml") {
            continue;
        }
        try {
            const packageName = (0, repositoryMeshResolution_1.extractPackageNameFromPackageXml)(await readText(file));
            if (!packageName) {
                continue;
            }
            overrides[(0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path)] = packageName;
        }
        catch {
            continue;
        }
    }
    return overrides;
};
exports.buildPackageNameByPathFromRepositoryFiles = buildPackageNameByPathFromRepositoryFiles;

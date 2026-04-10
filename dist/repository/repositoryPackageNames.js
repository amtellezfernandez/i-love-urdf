"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPackageNameByPathFromRepositoryFiles = void 0;
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const REPOSITORY_PACKAGE_XML_READ_CONCURRENCY = 8;
const buildPackageNameByPathFromRepositoryFiles = async (files, readText) => {
    const overrides = {};
    const packageFiles = files.filter((file) => file.type === "file" &&
        (file.path.toLowerCase().endsWith("/package.xml") || file.path.toLowerCase() === "package.xml"));
    if (packageFiles.length === 0) {
        return overrides;
    }
    let cursor = 0;
    const workers = Array.from({ length: Math.min(REPOSITORY_PACKAGE_XML_READ_CONCURRENCY, packageFiles.length) }, async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= packageFiles.length) {
                return;
            }
            const file = packageFiles[index];
            if (!file) {
                return;
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
    });
    await Promise.all(workers);
    return overrides;
};
exports.buildPackageNameByPathFromRepositoryFiles = buildPackageNameByPathFromRepositoryFiles;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertMeshToUsd = convertMeshToUsd;
exports.convertLoadedSourceToUSD = convertLoadedSourceToUSD;
exports.convertURDFPathToUSD = convertURDFPathToUSD;
exports.convertLocalSourcePathToUSD = convertLocalSourcePathToUSD;
const fs = require("node:fs");
const path = require("node:path");
const urdfToUSD_1 = require("../convert/urdfToUSD");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const repositoryMeshResolution_1 = require("../repository/repositoryMeshResolution");
const loadSourceNode_1 = require("../sources/loadSourceNode");
const stlBinary_1 = require("../mesh/stlBinary");
const normalizeFsPath = (value) => value.replace(/\\/g, "/");
const toUsdAssetPath = (absolutePath, outputPath) => {
    const normalizedAbsolute = normalizeFsPath(absolutePath);
    if (!outputPath) {
        return normalizedAbsolute;
    }
    const relative = normalizeFsPath(path.relative(path.dirname(outputPath), absolutePath));
    if (!relative || relative === ".") {
        return `./${path.basename(absolutePath)}`;
    }
    if (relative.startsWith(".")) {
        return relative;
    }
    return `./${relative}`;
};
const normalizeLoadedEntryPath = (rootPath, entryPath, fallbackPath) => {
    if (entryPath) {
        if (rootPath && path.isAbsolute(entryPath)) {
            return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, entryPath));
        }
        return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(entryPath);
    }
    if (rootPath && fallbackPath) {
        return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, fallbackPath));
    }
    if (fallbackPath) {
        return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.basename(fallbackPath));
    }
    return null;
};
const buildLocalMeshResolver = (files, entryPath, rootPath, outputPath) => {
    return (request) => {
        const file = (0, repositoryMeshResolution_1.resolveRepositoryFileReference)(entryPath, request.meshRef, files);
        if (!file) {
            return {
                kind: "unsupported",
                sourcePath: request.meshRef,
                reason: "could not resolve the mesh reference inside the local repository",
            };
        }
        const absolutePath = file.absolutePath || path.resolve(rootPath, file.path);
        const extension = path.extname(absolutePath).toLowerCase();
        if (extension === ".stl") {
            const mesh = (0, stlBinary_1.readStlTriangles)(absolutePath);
            return {
                kind: "inline-triangles",
                mesh: {
                    triangles: mesh.triangles,
                    sourcePath: normalizeFsPath(file.path),
                },
            };
        }
        if (extension === ".usd" || extension === ".usda" || extension === ".usdc") {
            return {
                kind: "usd-reference",
                assetPath: toUsdAssetPath(absolutePath, outputPath),
            };
        }
        return {
            kind: "unsupported",
            sourcePath: request.meshRef,
            reason: `Only STL input and existing USD assets are supported for local mesh resolution. Received ${extension || "unknown"}.`,
        };
    };
};
const writeText = (targetPath, content) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf8");
};
function convertMeshToUsd(meshPath, options = {}) {
    const absoluteMeshPath = path.resolve(meshPath);
    const extension = path.extname(absoluteMeshPath).toLowerCase();
    if (extension === ".usd" || extension === ".usda" || extension === ".usdc") {
        return {
            sourcePath: absoluteMeshPath,
            usdPath: absoluteMeshPath,
            usdContent: null,
            wroteFile: false,
            warnings: ["Mesh already points to a USD asset; no conversion was required."],
        };
    }
    if (extension !== ".stl") {
        throw new Error(`convertMeshToUsd accepts STL input only. Received ${extension || "unknown"}.`);
    }
    const targetPath = options.outPath ||
        path.join(path.dirname(absoluteMeshPath), `${path.basename(absoluteMeshPath, extension)}.usda`);
    const triangles = (0, stlBinary_1.readStlTriangles)(absoluteMeshPath);
    const meshPrim = (0, urdfToUSD_1.createInlineUsdMeshPrim)({
        triangles: triangles.triangles,
        sourcePath: normalizeFsPath(absoluteMeshPath),
    }, { name: "Mesh" });
    const stage = (0, urdfToUSD_1.createUsdStage)(targetPath, {
        defaultPrim: "MeshAsset",
        upAxis: options.upAxis || "Z",
        metersPerUnit: options.metersPerUnit ?? 1,
        kilogramsPerUnit: options.kilogramsPerUnit ?? 1,
        rootPrims: [
            {
                name: "MeshAsset",
                typeName: "Xform",
                children: [meshPrim],
            },
        ],
    });
    const usdContent = stage.toUsda();
    const shouldWrite = options.write !== false;
    if (shouldWrite) {
        writeText(targetPath, usdContent);
    }
    return {
        sourcePath: absoluteMeshPath,
        usdPath: targetPath,
        usdContent,
        wroteFile: shouldWrite,
        warnings: [],
        stage,
    };
}
async function convertLoadedSourceToUSD(source, options = {}) {
    const rootPath = options.rootPath || source.rootPath || null;
    const entryPath = normalizeLoadedEntryPath(rootPath, source.entryPath, source.inspectedPath);
    const files = rootPath && entryPath
        ? await (0, localRepositoryInspection_1.collectLocalRepositoryFiles)(rootPath)
        : null;
    const meshResolver = files && rootPath && entryPath
        ? buildLocalMeshResolver(files, entryPath, rootPath, options.outputPath)
        : options.meshResolver;
    const result = (0, urdfToUSD_1.convertURDFToUSD)(source.urdf, {
        ...options,
        meshResolver,
    });
    if (options.outputPath) {
        writeText(options.outputPath, result.usdContent);
    }
    return {
        ...result,
        outputPath: options.outputPath || null,
        rootPath,
        entryPath,
    };
}
async function convertURDFPathToUSD(urdfPath, options = {}) {
    const absoluteUrdfPath = path.resolve(urdfPath);
    const rootPath = options.rootPath || path.dirname(absoluteUrdfPath);
    return convertLoadedSourceToUSD({
        source: "local-file",
        inspectedPath: absoluteUrdfPath,
        rootPath,
        entryPath: (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, absoluteUrdfPath)),
        entryFormat: "urdf",
        inspectionMode: "urdf",
        urdf: fs.readFileSync(absoluteUrdfPath, "utf8"),
        runtime: null,
    }, options);
}
async function convertLocalSourcePathToUSD(options) {
    const loaded = await (0, loadSourceNode_1.loadSourceFromPath)(options);
    return convertLoadedSourceToUSD(loaded, options);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDIT_CONVERSION_COMMAND_HANDLERS = void 0;
const fs = require("node:fs");
const path = require("node:path");
const index_1 = require("../index");
const meshPrep_1 = require("../mesh/meshPrep");
const meshPaths_1 = require("../mesh/meshPaths");
const xmlDom_1 = require("../xmlDom");
const editCommandRuntime_1 = require("./editCommandRuntime");
const inspectLocalMeshFaceBudgetWarnings = (urdfPath, urdfContent) => {
    const doc = (0, xmlDom_1.parseXml)(urdfContent);
    const urdfDir = path.dirname(path.resolve(urdfPath));
    const riskyMeshes = new Map();
    for (const meshElement of Array.from(doc.querySelectorAll("mesh"))) {
        const rawRef = meshElement.getAttribute("filename");
        if (!rawRef)
            continue;
        const parsedRef = (0, meshPaths_1.parseMeshReference)(rawRef);
        const refPath = parsedRef.path || parsedRef.raw;
        if (!refPath.toLowerCase().endsWith(".stl"))
            continue;
        let absoluteMeshPath = "";
        if (parsedRef.scheme === "file" && parsedRef.isAbsoluteFile) {
            absoluteMeshPath = parsedRef.path;
        }
        else if (parsedRef.scheme === null || (parsedRef.scheme === "file" && !parsedRef.isAbsoluteFile)) {
            absoluteMeshPath = path.resolve(urdfDir, refPath);
        }
        else {
            continue;
        }
        if (!fs.existsSync(absoluteMeshPath) || !fs.statSync(absoluteMeshPath).isFile()) {
            continue;
        }
        const buffer = fs.readFileSync(absoluteMeshPath);
        if (buffer.length < 84)
            continue;
        const faceCount = buffer.readUInt32LE(80);
        if (faceCount <= meshPrep_1.DEFAULT_MESH_COMPRESSION_MAX_FACES)
            continue;
        riskyMeshes.set(absoluteMeshPath, {
            meshPath: absoluteMeshPath,
            faceCount,
            meshDir: path.dirname(absoluteMeshPath),
        });
    }
    if (riskyMeshes.size === 0) {
        return [];
    }
    const riskyMeshList = Array.from(riskyMeshes.values());
    const meshDirs = Array.from(new Set(riskyMeshList.map((mesh) => mesh.meshDir)));
    const commandHint = meshDirs.length === 1
        ? ` Inspect: ilu inspect-meshes --mesh-dir ${meshDirs[0]}. Fix: ilu compress-meshes --mesh-dir ${meshDirs[0]} --in-place`
        : " Inspect those mesh directories with inspect-meshes, then run compress-meshes on the ones that contain the failing STL files.";
    const meshSummary = riskyMeshList
        .slice(0, 3)
        .map((mesh) => `${path.basename(mesh.meshPath)} (${mesh.faceCount} faces)`)
        .join(", ");
    return [
        `Detected ${riskyMeshList.length} STL mesh${riskyMeshList.length === 1 ? "" : "es"} above the current face budget of ${meshPrep_1.DEFAULT_MESH_COMPRESSION_MAX_FACES}. Downstream import may fail or require simplification: ${meshSummary}.${commandHint}`,
    ];
};
exports.EDIT_CONVERSION_COMMAND_HANDLERS = {
    "urdf-to-mjcf": ({ helpers, urdfPath, urdfContent, outPath }) => {
        const result = (0, index_1.convertURDFToMJCF)(urdfContent);
        result.warnings.push(...inspectLocalMeshFaceBudgetWarnings(urdfPath, urdfContent));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.mjcfContent, result);
    },
    "urdf-to-xacro": ({ helpers, urdfContent, outPath }) => {
        const result = (0, index_1.convertURDFToXacro)(urdfContent);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.xacroContent, result);
    },
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANALYSIS_MESH_COMMAND_HANDLERS = void 0;
const meshPrep_1 = require("../mesh/meshPrep");
const analysisCommandRuntime_1 = require("./analysisCommandRuntime");
const localMeshReferenceInspection_1 = require("./localMeshReferenceInspection");
exports.ANALYSIS_MESH_COMMAND_HANDLERS = {
    "inspect-meshes": (args, helpers) => {
        const meshDir = helpers.requireStringArg(args, "mesh-dir");
        (0, analysisCommandRuntime_1.emitJson)((0, meshPrep_1.inspectMeshes)({
            meshDir,
            maxFaces: helpers.getOptionalNumberArg(args, "max-faces"),
            meshes: helpers.getDelimitedStringArg(args, "meshes", "mesh"),
            limits: helpers.getNumericKeyValueArg(args, "limits", "limit"),
        }));
    },
    "compress-meshes": (args, helpers) => {
        const meshDir = helpers.requireStringArg(args, "mesh-dir");
        const outDir = helpers.getOptionalStringArg(args, "out-dir");
        const inPlace = Boolean(args.get("in-place"));
        if (inPlace && outDir) {
            helpers.fail("compress-meshes accepts either --in-place or --out-dir, not both.");
        }
        (0, analysisCommandRuntime_1.emitJson)((0, meshPrep_1.compressMeshes)({
            meshDir,
            maxFaces: helpers.getOptionalNumberArg(args, "max-faces"),
            meshes: helpers.getDelimitedStringArg(args, "meshes", "mesh"),
            limits: helpers.getNumericKeyValueArg(args, "limits", "limit"),
            inPlace,
            outDir,
        }));
    },
    "mesh-refs": (args, helpers) => {
        const { urdfPath, urdfContent } = (0, analysisCommandRuntime_1.readRequiredUrdfInput)(args, helpers);
        (0, analysisCommandRuntime_1.emitJson)((0, localMeshReferenceInspection_1.inspectLocalMeshReferences)(urdfPath, urdfContent));
    },
};

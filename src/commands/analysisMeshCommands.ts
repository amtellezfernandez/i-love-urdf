import { compressMeshes, inspectMeshes } from "../mesh/meshPrep";
import {
  emitJson,
  extractMeshRefs,
  readRequiredUrdfInput,
  type AnalysisCommandHandler,
} from "./analysisCommandRuntime";

export const ANALYSIS_MESH_COMMAND_HANDLERS = {
  "inspect-meshes": (args, helpers) => {
    const meshDir = helpers.requireStringArg(args, "mesh-dir");
    emitJson(
      inspectMeshes({
        meshDir,
        maxFaces: helpers.getOptionalNumberArg(args, "max-faces"),
        meshes: helpers.getDelimitedStringArg(args, "meshes", "mesh"),
        limits: helpers.getNumericKeyValueArg(args, "limits", "limit"),
      })
    );
  },

  "compress-meshes": (args, helpers) => {
    const meshDir = helpers.requireStringArg(args, "mesh-dir");
    const outDir = helpers.getOptionalStringArg(args, "out-dir");
    const inPlace = Boolean(args.get("in-place"));
    if (inPlace && outDir) {
      helpers.fail("compress-meshes accepts either --in-place or --out-dir, not both.");
    }

    emitJson(
      compressMeshes({
        meshDir,
        maxFaces: helpers.getOptionalNumberArg(args, "max-faces"),
        meshes: helpers.getDelimitedStringArg(args, "meshes", "mesh"),
        limits: helpers.getNumericKeyValueArg(args, "limits", "limit"),
        inPlace,
        outDir,
      })
    );
  },

  "mesh-refs": (args, helpers) => {
    const refs = extractMeshRefs(readRequiredUrdfInput(args, helpers).urdfContent);
    emitJson({ count: refs.length, refs });
  },
} satisfies Record<"inspect-meshes" | "compress-meshes" | "mesh-refs", AnalysisCommandHandler>;

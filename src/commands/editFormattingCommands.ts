import {
  canonicalOrderURDF,
  fixMeshPaths,
  normalizeJointAxes,
  prettyPrintURDF,
  snapJointAxes,
  updateMeshPathsToAssetsInUrdf,
} from "../index";
import { emitWrittenPayload, type EditCommandHandler } from "./editCommandRuntime";

export const EDIT_FORMATTING_COMMAND_HANDLERS = {
  "fix-mesh-paths": ({ args, helpers, urdfContent, outPath }) => {
    const result = fixMeshPaths(urdfContent, helpers.getOptionalStringArg(args, "package"));
    emitWrittenPayload(helpers, outPath, result.urdfContent, result);
  },

  "canonical-order": ({ helpers, urdfContent, outPath }) => {
    const ordered = canonicalOrderURDF(urdfContent);
    emitWrittenPayload(helpers, outPath, ordered, { urdfContent: ordered });
  },

  "pretty-print": ({ args, helpers, urdfContent, outPath }) => {
    const indent = helpers.getOptionalNumberArg(args, "indent") ?? 2;
    const pretty = prettyPrintURDF(urdfContent, indent);
    emitWrittenPayload(helpers, outPath, pretty, { urdfContent: pretty, indent });
  },

  "normalize-axes": ({ helpers, urdfContent, outPath }) => {
    const result = normalizeJointAxes(urdfContent);
    emitWrittenPayload(helpers, outPath, result.urdfContent, result);
  },

  "snap-axes": ({ args, helpers, urdfContent, outPath }) => {
    const result = snapJointAxes(urdfContent, {
      snapTolerance: helpers.getOptionalNumberArg(args, "tolerance"),
    });
    emitWrittenPayload(helpers, outPath, result.urdfContent, result);
  },

  "mesh-to-assets": ({ helpers, urdfContent, outPath }) => {
    const result = updateMeshPathsToAssetsInUrdf(urdfContent);
    emitWrittenPayload(helpers, outPath, result.content, result);
  },
} satisfies Record<
  | "fix-mesh-paths"
  | "canonical-order"
  | "pretty-print"
  | "normalize-axes"
  | "snap-axes"
  | "mesh-to-assets",
  EditCommandHandler
>;

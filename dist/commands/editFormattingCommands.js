"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDIT_FORMATTING_COMMAND_HANDLERS = void 0;
const index_1 = require("../index");
const editCommandRuntime_1 = require("./editCommandRuntime");
exports.EDIT_FORMATTING_COMMAND_HANDLERS = {
    "fix-mesh-paths": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.fixMeshPaths)(urdfContent, helpers.getOptionalStringArg(args, "package"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.urdfContent, result);
    },
    "canonical-order": ({ helpers, urdfContent, outPath }) => {
        const ordered = (0, index_1.canonicalOrderURDF)(urdfContent);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, ordered, { urdfContent: ordered });
    },
    "pretty-print": ({ args, helpers, urdfContent, outPath }) => {
        const indent = helpers.getOptionalNumberArg(args, "indent") ?? 2;
        const pretty = (0, index_1.prettyPrintURDF)(urdfContent, indent);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, pretty, { urdfContent: pretty, indent });
    },
    "normalize-axes": ({ helpers, urdfContent, outPath }) => {
        const result = (0, index_1.normalizeJointAxes)(urdfContent);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.urdfContent, result);
    },
    "snap-axes": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.snapJointAxes)(urdfContent, {
            snapTolerance: helpers.getOptionalNumberArg(args, "tolerance"),
        });
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.urdfContent, result);
    },
    "mesh-to-assets": ({ helpers, urdfContent, outPath }) => {
        const result = (0, index_1.updateMeshPathsToAssetsInUrdf)(urdfContent);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
};

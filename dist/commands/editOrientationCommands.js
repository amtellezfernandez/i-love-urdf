"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDIT_ORIENTATION_COMMAND_HANDLERS = void 0;
const index_1 = require("../index");
const editCommandRuntime_1 = require("./editCommandRuntime");
exports.EDIT_ORIENTATION_COMMAND_HANDLERS = {
    "rotate-90": ({ args, helpers, urdfContent, outPath }) => {
        const axis = helpers.getSimpleAxisArg(args, "axis") ?? helpers.fail("rotate-90 requires --axis.");
        const rotated = (0, index_1.rotateRobot90Degrees)(urdfContent, axis);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, rotated, { urdfContent: rotated, axis });
    },
    "apply-orientation": ({ args, helpers, urdfContent, outPath }) => {
        const sourceUpAxis = helpers.getAxisSpecArg(args, "source-up");
        const sourceForwardAxis = helpers.getAxisSpecArg(args, "source-forward");
        if (!sourceUpAxis || !sourceForwardAxis) {
            helpers.fail("apply-orientation requires --source-up and --source-forward.");
        }
        const targetUpAxis = helpers.getAxisSpecArg(args, "target-up");
        const targetForwardAxis = helpers.getAxisSpecArg(args, "target-forward");
        const rotated = (0, index_1.applyOrientationToRobot)(urdfContent, {
            sourceUpAxis,
            sourceForwardAxis,
            targetUpAxis,
            targetForwardAxis,
        });
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, rotated, {
            urdfContent: rotated,
            sourceUpAxis,
            sourceForwardAxis,
            targetUpAxis: targetUpAxis || "z",
            targetForwardAxis: targetForwardAxis || "x",
        });
    },
    "normalize-robot": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.normalizeRobot)(urdfContent, {
            apply: Boolean(args.get("apply")),
            snapAxes: Boolean(args.get("snap-axes")),
            canonicalizeJointFrame: Boolean(args.get("canonicalize-joint-frame")),
            targetJointAxis: helpers.getSimpleAxisArg(args, "target-axis"),
            sourceUpAxis: helpers.getAxisSpecArg(args, "source-up"),
            sourceForwardAxis: helpers.getAxisSpecArg(args, "source-forward"),
            targetUpAxis: helpers.getAxisSpecArg(args, "target-up"),
            targetForwardAxis: helpers.getAxisSpecArg(args, "target-forward"),
            prettyPrint: Boolean(args.get("pretty-print")),
            canonicalOrder: Boolean(args.get("canonical-order")),
            axisSnapTolerance: helpers.getOptionalNumberArg(args, "tolerance"),
        });
        if (result.apply && result.outputUrdf && outPath) {
            helpers.writeOutIfRequested(outPath, result.outputUrdf);
        }
        (0, editCommandRuntime_1.emitJson)({ ...result, outPath: outPath || null });
    },
};

import { applyOrientationToRobot, normalizeRobot, rotateRobot90Degrees } from "../index";
import { emitJson, emitWrittenPayload, type EditCommandHandler } from "./editCommandRuntime";

export const EDIT_ORIENTATION_COMMAND_HANDLERS = {
  "rotate-90": ({ args, helpers, urdfContent, outPath }) => {
    const axis = helpers.getSimpleAxisArg(args, "axis") ?? helpers.fail("rotate-90 requires --axis.");
    const rotated = rotateRobot90Degrees(urdfContent, axis);
    emitWrittenPayload(helpers, outPath, rotated, { urdfContent: rotated, axis });
  },

  "apply-orientation": ({ args, helpers, urdfContent, outPath }) => {
    const sourceUpAxis = helpers.getAxisSpecArg(args, "source-up");
    const sourceForwardAxis = helpers.getAxisSpecArg(args, "source-forward");
    if (!sourceUpAxis || !sourceForwardAxis) {
      helpers.fail("apply-orientation requires --source-up and --source-forward.");
    }

    const targetUpAxis = helpers.getAxisSpecArg(args, "target-up");
    const targetForwardAxis = helpers.getAxisSpecArg(args, "target-forward");
    const rotated = applyOrientationToRobot(urdfContent, {
      sourceUpAxis,
      sourceForwardAxis,
      targetUpAxis,
      targetForwardAxis,
    });

    emitWrittenPayload(helpers, outPath, rotated, {
      urdfContent: rotated,
      sourceUpAxis,
      sourceForwardAxis,
      targetUpAxis: targetUpAxis || "z",
      targetForwardAxis: targetForwardAxis || "x",
    });
  },

  "normalize-robot": ({ args, helpers, urdfContent, outPath }) => {
    const result = normalizeRobot(urdfContent, {
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

    emitJson({ ...result, outPath: outPath || null });
  },
} satisfies Record<"rotate-90" | "apply-orientation" | "normalize-robot", EditCommandHandler>;

import {
  removeJointsFromUrdf,
  renameJointInUrdf,
  renameLinkInUrdf,
  setJointAxisInUrdf,
  updateJointLimitsInUrdf,
  updateJointLinksInUrdf,
  updateJointTypeInUrdf,
  updateJointVelocityInUrdf,
  updateMaterialColorInUrdf,
} from "../index";
import { canonicalizeJointFrames } from "../transforms/canonicalizeJointFrames";
import {
  emitWrittenPayload,
  readSelectedJointNames,
  type EditCommandHandler,
} from "./editCommandRuntime";

export const EDIT_JOINT_COMMAND_HANDLERS = {
  "set-joint-axis": ({ args, helpers, urdfContent, outPath }) => {
    const result = setJointAxisInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "joint"),
      helpers.parseTripletArg(helpers.requireStringArg(args, "xyz"), "joint axis")
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "set-joint-type": ({ args, helpers, urdfContent, outPath }) => {
    const result = updateJointTypeInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "joint"),
      helpers.requireStringArg(args, "type"),
      helpers.getOptionalNumberArg(args, "lower"),
      helpers.getOptionalNumberArg(args, "upper")
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "set-joint-limits": ({ args, helpers, urdfContent, outPath }) => {
    const result = updateJointLimitsInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "joint"),
      helpers.getOptionalNumberArg(args, "lower"),
      helpers.getOptionalNumberArg(args, "upper")
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "set-joint-velocity": ({ args, helpers, urdfContent, outPath }) => {
    const velocity = helpers.getOptionalNumberArg(args, "velocity");
    if (velocity === undefined) {
      helpers.fail("set-joint-velocity requires --velocity.");
    }

    const result = updateJointVelocityInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "joint"),
      velocity
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "canonicalize-joint-frame": ({ args, helpers, urdfContent, outPath }) => {
    const jointNames = readSelectedJointNames(args, helpers);
    const result = canonicalizeJointFrames(urdfContent, {
      targetAxis: helpers.getSimpleAxisArg(args, "target-axis") ?? "z",
      joints: jointNames.length > 0 ? jointNames : undefined,
    });
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "remove-joints": ({ args, helpers, urdfContent, outPath }) => {
    const jointNames = readSelectedJointNames(args, helpers);
    if (jointNames.length === 0) {
      helpers.fail("remove-joints requires --joints with at least one joint name");
    }

    const result = removeJointsFromUrdf(urdfContent, jointNames);
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "reassign-joint": ({ args, helpers, urdfContent, outPath }) => {
    const result = updateJointLinksInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "joint"),
      helpers.requireStringArg(args, "parent"),
      helpers.requireStringArg(args, "child")
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "set-material-color": ({ args, helpers, urdfContent, outPath }) => {
    const result = updateMaterialColorInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "link"),
      helpers.requireStringArg(args, "material"),
      helpers.requireHexColorArg(args, "color")
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "rename-joint": ({ args, helpers, urdfContent, outPath }) => {
    const result = renameJointInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "joint"),
      helpers.requireStringArg(args, "name")
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "rename-link": ({ args, helpers, urdfContent, outPath }) => {
    const result = renameLinkInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "link"),
      helpers.requireStringArg(args, "name")
    );
    emitWrittenPayload(helpers, outPath, result.content, result);
  },
} satisfies Record<
  | "set-joint-axis"
  | "set-joint-type"
  | "set-joint-limits"
  | "set-joint-velocity"
  | "canonicalize-joint-frame"
  | "remove-joints"
  | "reassign-joint"
  | "set-material-color"
  | "rename-joint"
  | "rename-link",
  EditCommandHandler
>;

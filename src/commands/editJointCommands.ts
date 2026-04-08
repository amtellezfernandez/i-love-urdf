import * as path from "node:path";
import * as fs from "node:fs";
import {
  mergeUrdfs,
  removeJointsFromUrdf,
  replaceSubrobotInUrdf,
  renameJointInUrdf,
  renameLinkInUrdf,
  setJointAxisInUrdf,
  updateJointOriginInUrdf,
  updateJointLimitsInUrdf,
  updateJointLinksInUrdf,
  updateJointTypeInUrdf,
  updateJointVelocityInUrdf,
  updateMaterialColorInUrdf,
} from "../index";
import { canonicalizeJointFrames } from "../transforms/canonicalizeJointFrames";
import { openStudioForReplaceSubrobotCalibration, stageReplaceSubrobotCalibrationSession } from "../session/replaceSubrobotCalibrationSession";
import { bundleMeshAssetsForUrdfFile } from "../node/bundleMeshAssets";
import {
  emitJson,
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

  "set-joint-origin": ({ args, helpers, urdfContent, outPath }) => {
    const result = updateJointOriginInUrdf(
      urdfContent,
      helpers.requireStringArg(args, "joint"),
      helpers.parseTripletArg(helpers.requireStringArg(args, "xyz"), "joint origin xyz"),
      helpers.parseTripletArg(helpers.requireStringArg(args, "rpy"), "joint origin rpy")
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

  "merge-urdf": ({ args, helpers, urdfContent, urdfPath, outPath }) => {
    const attachPaths = helpers.getDelimitedStringArg(args, "attach");
    if (attachPaths.length === 0) {
      helpers.fail("merge-urdf requires --attach with at least one URDF path.");
    }

    const spacing = helpers.getOptionalNumberArg(args, "spacing");
    const result = mergeUrdfs(
      [
        {
          id: path.basename(urdfPath, path.extname(urdfPath)) || "primary_robot",
          name: path.basename(urdfPath),
          urdfContent,
          originX: 0,
        },
        ...attachPaths.map((attachPath) => ({
          id: path.basename(attachPath, path.extname(attachPath)) || "attached_robot",
          name: path.basename(attachPath),
          urdfContent: helpers.readText(attachPath),
        })),
      ],
      {
        robotName: helpers.getOptionalStringArg(args, "name"),
        spacing,
      }
    );
    if (!result.success) {
      emitJson({ ...result, outPath: null });
      return;
    }
    emitWrittenPayload(helpers, outPath, result.content, result);
  },

  "replace-subrobot": async ({ args, helpers, urdfContent, outPath }) => {
    const replacementPath = helpers.requireStringArg(args, "replacement");
    const mountXyz = helpers.getOptionalStringArg(args, "xyz");
    const mountRpy = helpers.getOptionalStringArg(args, "rpy");
    const result = replaceSubrobotInUrdf(urdfContent, {
      targetRootLink: helpers.requireStringArg(args, "replace-root"),
      replacementUrdfContent: helpers.readText(replacementPath),
      replacementRootLink: helpers.requireStringArg(args, "replacement-root"),
      mountParentLink: helpers.getOptionalStringArg(args, "mount-parent"),
      mountJointName: helpers.getOptionalStringArg(args, "mount-joint"),
      prefix: helpers.getOptionalStringArg(args, "prefix"),
      mount:
        mountXyz || mountRpy
          ? {
              xyz: mountXyz ? helpers.parseTripletArg(mountXyz, "mount xyz") : undefined,
              rpy: mountRpy ? helpers.parseTripletArg(mountRpy, "mount rpy") : undefined,
            }
          : undefined,
    });
    if (!result.success) {
      emitWrittenPayload(helpers, outPath, result.content, result);
      return;
    }

    if (!args.has("calibrate")) {
      if (!args.has("portable")) {
        emitWrittenPayload(helpers, outPath, result.content, result);
        return;
      }

      const bundleOutPath =
        outPath ||
        helpers.requireStringArg(args, "urdf").replace(/\.(urdf\.xacro|xacro|urdf)$/i, ".portable.urdf");
      const bundled = bundleMeshAssetsForUrdfFile({
        urdfPath: helpers.requireStringArg(args, "urdf"),
        urdfContent: result.content,
        outPath: bundleOutPath,
        extraSearchRoots: [replacementPath],
      });
      fs.mkdirSync(path.dirname(bundleOutPath), { recursive: true });
      fs.writeFileSync(bundleOutPath, bundled.content, "utf8");
      emitJson({
        ...result,
        outPath: bundleOutPath,
        portable: true,
        portableBundle: bundled,
      });
      return;
    }

    const calibration = stageReplaceSubrobotCalibrationSession({
      fileNameHint: path.basename(outPath || helpers.requireStringArg(args, "urdf")).replace(
        /\.(urdf\.xacro|xacro)$/i,
        ".urdf"
      ),
      hostUrdfPath: helpers.requireStringArg(args, "urdf"),
      replacementUrdfPath: replacementPath,
      urdfContent: result.content,
    });
    helpers.writeOutIfRequested(outPath, result.content);

    try {
      const visualizer = await openStudioForReplaceSubrobotCalibration(calibration.sessionId, {
      focusJoint: result.mountJointName,
      calibrateMode: true,
      });
      const started = visualizer.started;
      const visualizerStart =
        "code" in started
          ? {
              ok: false as const,
              code: started.code,
              reason: started.reason,
              studioRoot: started.studioRoot,
            }
          : {
              ok: true as const,
              studioRoot: started.studioRoot,
            };
      emitJson({
        ...result,
        outPath: outPath || null,
        portable: args.has("portable"),
        calibrationSessionId: calibration.sessionId,
        calibrationWorkspaceRoot: calibration.workspaceRoot,
        calibrationWorkingUrdfPath: calibration.workingUrdfPath,
        calibrationCopiedFiles: calibration.copiedFiles,
        studioUrl: visualizer.studioUrl,
        visualizerOpened: visualizer.opened,
        portableFinalizeCommand:
          args.has("portable") && outPath
            ? `ilu bundle-mesh-assets --urdf ${JSON.stringify(calibration.workingUrdfPath)} --out ${JSON.stringify(outPath)}`
            : null,
        visualizerStart,
      });
    } catch (error: unknown) {
      emitJson({
        ...result,
        outPath: outPath || null,
        portable: args.has("portable"),
        calibrationSessionId: calibration.sessionId,
        calibrationWorkspaceRoot: calibration.workspaceRoot,
        calibrationWorkingUrdfPath: calibration.workingUrdfPath,
        calibrationCopiedFiles: calibration.copiedFiles,
        studioUrl: calibration.studioUrl,
        visualizerOpened: false,
        portableFinalizeCommand:
          args.has("portable") && outPath
            ? `ilu bundle-mesh-assets --urdf ${JSON.stringify(calibration.workingUrdfPath)} --out ${JSON.stringify(outPath)}`
            : null,
        visualizerStart: {
          ok: false,
          code: "startup-failed",
          reason: error instanceof Error ? error.message : "Failed to open Studio calibration session.",
          studioRoot: null,
        },
      });
    }
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
  | "set-joint-origin"
  | "set-joint-type"
  | "set-joint-limits"
  | "set-joint-velocity"
  | "canonicalize-joint-frame"
  | "remove-joints"
  | "reassign-joint"
  | "set-material-color"
  | "merge-urdf"
  | "replace-subrobot"
  | "rename-joint"
  | "rename-link",
  EditCommandHandler
>;

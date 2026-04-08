"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDIT_JOINT_COMMAND_HANDLERS = void 0;
const path = require("node:path");
const fs = require("node:fs");
const index_1 = require("../index");
const canonicalizeJointFrames_1 = require("../transforms/canonicalizeJointFrames");
const replaceSubrobotCalibrationSession_1 = require("../session/replaceSubrobotCalibrationSession");
const bundleMeshAssets_1 = require("../node/bundleMeshAssets");
const editCommandRuntime_1 = require("./editCommandRuntime");
exports.EDIT_JOINT_COMMAND_HANDLERS = {
    "set-joint-axis": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.setJointAxisInUrdf)(urdfContent, helpers.requireStringArg(args, "joint"), helpers.parseTripletArg(helpers.requireStringArg(args, "xyz"), "joint axis"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "set-joint-origin": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.updateJointOriginInUrdf)(urdfContent, helpers.requireStringArg(args, "joint"), helpers.parseTripletArg(helpers.requireStringArg(args, "xyz"), "joint origin xyz"), helpers.parseTripletArg(helpers.requireStringArg(args, "rpy"), "joint origin rpy"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "set-joint-type": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.updateJointTypeInUrdf)(urdfContent, helpers.requireStringArg(args, "joint"), helpers.requireStringArg(args, "type"), helpers.getOptionalNumberArg(args, "lower"), helpers.getOptionalNumberArg(args, "upper"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "set-joint-limits": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.updateJointLimitsInUrdf)(urdfContent, helpers.requireStringArg(args, "joint"), helpers.getOptionalNumberArg(args, "lower"), helpers.getOptionalNumberArg(args, "upper"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "set-joint-velocity": ({ args, helpers, urdfContent, outPath }) => {
        const velocity = helpers.getOptionalNumberArg(args, "velocity");
        if (velocity === undefined) {
            helpers.fail("set-joint-velocity requires --velocity.");
        }
        const result = (0, index_1.updateJointVelocityInUrdf)(urdfContent, helpers.requireStringArg(args, "joint"), velocity);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "canonicalize-joint-frame": ({ args, helpers, urdfContent, outPath }) => {
        const jointNames = (0, editCommandRuntime_1.readSelectedJointNames)(args, helpers);
        const result = (0, canonicalizeJointFrames_1.canonicalizeJointFrames)(urdfContent, {
            targetAxis: helpers.getSimpleAxisArg(args, "target-axis") ?? "z",
            joints: jointNames.length > 0 ? jointNames : undefined,
        });
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "remove-joints": ({ args, helpers, urdfContent, outPath }) => {
        const jointNames = (0, editCommandRuntime_1.readSelectedJointNames)(args, helpers);
        if (jointNames.length === 0) {
            helpers.fail("remove-joints requires --joints with at least one joint name");
        }
        const result = (0, index_1.removeJointsFromUrdf)(urdfContent, jointNames);
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "reassign-joint": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.updateJointLinksInUrdf)(urdfContent, helpers.requireStringArg(args, "joint"), helpers.requireStringArg(args, "parent"), helpers.requireStringArg(args, "child"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "set-material-color": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.updateMaterialColorInUrdf)(urdfContent, helpers.requireStringArg(args, "link"), helpers.requireStringArg(args, "material"), helpers.requireHexColorArg(args, "color"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "merge-urdf": ({ args, helpers, urdfContent, urdfPath, outPath }) => {
        const attachPaths = helpers.getDelimitedStringArg(args, "attach");
        if (attachPaths.length === 0) {
            helpers.fail("merge-urdf requires --attach with at least one URDF path.");
        }
        const spacing = helpers.getOptionalNumberArg(args, "spacing");
        const result = (0, index_1.mergeUrdfs)([
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
        ], {
            robotName: helpers.getOptionalStringArg(args, "name"),
            spacing,
        });
        if (!result.success) {
            (0, editCommandRuntime_1.emitJson)({ ...result, outPath: null });
            return;
        }
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "replace-subrobot": async ({ args, helpers, urdfContent, outPath }) => {
        const replacementPath = helpers.requireStringArg(args, "replacement");
        const mountXyz = helpers.getOptionalStringArg(args, "xyz");
        const mountRpy = helpers.getOptionalStringArg(args, "rpy");
        const result = (0, index_1.replaceSubrobotInUrdf)(urdfContent, {
            targetRootLink: helpers.requireStringArg(args, "replace-root"),
            replacementUrdfContent: helpers.readText(replacementPath),
            replacementRootLink: helpers.requireStringArg(args, "replacement-root"),
            mountParentLink: helpers.getOptionalStringArg(args, "mount-parent"),
            mountJointName: helpers.getOptionalStringArg(args, "mount-joint"),
            prefix: helpers.getOptionalStringArg(args, "prefix"),
            mount: mountXyz || mountRpy
                ? {
                    xyz: mountXyz ? helpers.parseTripletArg(mountXyz, "mount xyz") : undefined,
                    rpy: mountRpy ? helpers.parseTripletArg(mountRpy, "mount rpy") : undefined,
                }
                : undefined,
        });
        if (!result.success) {
            (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
            return;
        }
        if (!args.has("calibrate")) {
            if (!args.has("portable")) {
                (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
                return;
            }
            const bundleOutPath = outPath ||
                helpers.requireStringArg(args, "urdf").replace(/\.(urdf\.xacro|xacro|urdf)$/i, ".portable.urdf");
            const bundled = (0, bundleMeshAssets_1.bundleMeshAssetsForUrdfFile)({
                urdfPath: helpers.requireStringArg(args, "urdf"),
                urdfContent: result.content,
                outPath: bundleOutPath,
                extraSearchRoots: [replacementPath],
            });
            fs.mkdirSync(path.dirname(bundleOutPath), { recursive: true });
            fs.writeFileSync(bundleOutPath, bundled.content, "utf8");
            (0, editCommandRuntime_1.emitJson)({
                ...result,
                outPath: bundleOutPath,
                portable: true,
                portableBundle: bundled,
            });
            return;
        }
        const calibration = (0, replaceSubrobotCalibrationSession_1.stageReplaceSubrobotCalibrationSession)({
            fileNameHint: path.basename(outPath || helpers.requireStringArg(args, "urdf")).replace(/\.(urdf\.xacro|xacro)$/i, ".urdf"),
            hostUrdfPath: helpers.requireStringArg(args, "urdf"),
            replacementUrdfPath: replacementPath,
            urdfContent: result.content,
        });
        helpers.writeOutIfRequested(outPath, result.content);
        try {
            const visualizer = await (0, replaceSubrobotCalibrationSession_1.openStudioForReplaceSubrobotCalibration)(calibration.sessionId, {
                focusJoint: result.mountJointName,
                calibrateMode: true,
            });
            const started = visualizer.started;
            const visualizerStart = "code" in started
                ? {
                    ok: false,
                    code: started.code,
                    reason: started.reason,
                    studioRoot: started.studioRoot,
                }
                : {
                    ok: true,
                    studioRoot: started.studioRoot,
                };
            (0, editCommandRuntime_1.emitJson)({
                ...result,
                outPath: outPath || null,
                portable: args.has("portable"),
                calibrationSessionId: calibration.sessionId,
                calibrationWorkspaceRoot: calibration.workspaceRoot,
                calibrationWorkingUrdfPath: calibration.workingUrdfPath,
                calibrationCopiedFiles: calibration.copiedFiles,
                studioUrl: visualizer.studioUrl,
                visualizerOpened: visualizer.opened,
                portableFinalizeCommand: args.has("portable") && outPath
                    ? `ilu bundle-mesh-assets --urdf ${JSON.stringify(calibration.workingUrdfPath)} --out ${JSON.stringify(outPath)}`
                    : null,
                visualizerStart,
            });
        }
        catch (error) {
            (0, editCommandRuntime_1.emitJson)({
                ...result,
                outPath: outPath || null,
                portable: args.has("portable"),
                calibrationSessionId: calibration.sessionId,
                calibrationWorkspaceRoot: calibration.workspaceRoot,
                calibrationWorkingUrdfPath: calibration.workingUrdfPath,
                calibrationCopiedFiles: calibration.copiedFiles,
                studioUrl: calibration.studioUrl,
                visualizerOpened: false,
                portableFinalizeCommand: args.has("portable") && outPath
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
        const result = (0, index_1.renameJointInUrdf)(urdfContent, helpers.requireStringArg(args, "joint"), helpers.requireStringArg(args, "name"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
    "rename-link": ({ args, helpers, urdfContent, outPath }) => {
        const result = (0, index_1.renameLinkInUrdf)(urdfContent, helpers.requireStringArg(args, "link"), helpers.requireStringArg(args, "name"));
        (0, editCommandRuntime_1.emitWrittenPayload)(helpers, outPath, result.content, result);
    },
};

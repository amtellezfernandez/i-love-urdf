#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { installDomGlobals } from "./install-dom-globals.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

execFileSync(process.execPath, [path.join(root, "scripts", "build-package.mjs")], {
  stdio: "inherit",
  cwd: root,
});

const lib = await import(path.join(root, "dist", "index.js"));
const browserLib = await import(path.join(root, "dist", "browser.mjs"));
const localLib = await import(path.join(root, "dist", "repository", "localRepositoryInspection.js"));
const loadSourceNode = await import(path.join(root, "dist", "sources", "loadSourceNode.js"));
const xacroNode = await import(path.join(root, "dist", "xacro", "xacroNode.js"));
const meshNode = await import(path.join(root, "dist", "mesh", "meshNode.js"));
const urdfNode = await import(path.join(root, "dist", "node", "urdfNode.js"));

installDomGlobals();

const hasTagWithAttributes = (xml, tagName, attributes) => {
  const tags = xml.match(new RegExp(`<${tagName}\\b[^>]*>`, "g")) ?? [];
  return tags.some((tag) =>
    attributes.every(([name, value]) => tag.includes(`${name}="${value}"`))
  );
};

const urdf =
  "<robot name=\"smoke_robot\"><link name=\"base\"/><link name=\"tip\"/>" +
  "<joint name=\"j\" type=\"revolute\"><parent link=\"base\"/><child link=\"tip\"/>" +
  "<axis xyz=\"1 1 0\"/></joint><link name=\"mesh_link\"><visual><geometry>" +
  "<mesh filename=\"/abs/path/mesh.stl\"/></geometry></visual></link></robot>";

const transmissionUrdf =
  "<robot name=\"transmission_robot\"><link name=\"base\"/><link name=\"tip\"/>" +
  "<joint name=\"j\" type=\"revolute\"><parent link=\"base\"/><child link=\"tip\"/>" +
  "<axis xyz=\"0 0 1\"/></joint>" +
  "<transmission name=\"j_trans\"><type>transmission_interface/SimpleTransmission</type>" +
  "<joint name=\"j\"><hardwareInterface>hardware_interface/PositionJointInterface</hardwareInterface></joint>" +
  "<actuator name=\"motor\"><hardwareInterface>hardware_interface/PositionJointInterface</hardwareInterface>" +
  "<mechanicalReduction>1</mechanicalReduction></actuator></transmission></robot>";

const xacroRegressionUrdf =
  "<robot name=\"so101_robot\"><link name=\"arm_link_1\">" +
  "<visual><origin xyz=\"1 0 0\" rpy=\"0 0 0\"/><geometry>" +
  "<mesh filename=\"assets/sts3215_03a_v1.stl\" scale=\"0.001 0.001 0.001\"/></geometry>" +
  "<material name=\"sts3215\"/></visual></link>" +
  "<link name=\"arm_link_2\"><visual><origin xyz=\"1 0 0\" rpy=\"0 0 0\"/><geometry>" +
  "<mesh filename=\"assets/sts3215_03a_v1.stl\" scale=\"0.001 0.001 0.001\"/></geometry>" +
  "<material name=\"sts3215\"/></visual></link></robot>";

const wheeledRobotZUp =
  "<robot name=\"wheeled_z_up\">" +
  "<link name=\"base\"><collision><geometry><box size=\"1 0.4 0.2\"/></geometry></collision></link>" +
  "<link name=\"left_wheel\"><collision><origin xyz=\"0 0 0\" rpy=\"1.57079632679 0 0\"/><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<link name=\"right_wheel\"><collision><origin xyz=\"0 0 0\" rpy=\"1.57079632679 0 0\"/><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<joint name=\"left_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"left_wheel\"/><origin xyz=\"0 0.3 -0.1\" rpy=\"0 0 0\"/><axis xyz=\"0 1 0\"/></joint>" +
  "<joint name=\"right_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"right_wheel\"/><origin xyz=\"0 -0.3 -0.1\" rpy=\"0 0 0\"/><axis xyz=\"0 1 0\"/></joint>" +
  "</robot>";

const wheeledRobotYUp =
  "<robot name=\"wheeled_y_up\">" +
  "<link name=\"base\"><collision><geometry><box size=\"1 0.2 0.5\"/></geometry></collision></link>" +
  "<link name=\"left_wheel\"><collision><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<link name=\"right_wheel\"><collision><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<joint name=\"left_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"left_wheel\"/><origin xyz=\"0 -0.1 0.3\" rpy=\"0 0 0\"/><axis xyz=\"0 0 1\"/></joint>" +
  "<joint name=\"right_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"right_wheel\"/><origin xyz=\"0 -0.1 -0.3\" rpy=\"0 0 0\"/><axis xyz=\"0 0 1\"/></joint>" +
  "</robot>";

const badInertiaUrdf =
  "<robot name=\"bad_inertia\">" +
  "<link name=\"base\"><inertial><mass value=\"1\"/><origin xyz=\"0 0 0\" rpy=\"0 0 0\"/>" +
  "<inertia ixx=\"1\" ixy=\"0\" ixz=\"0\" iyy=\"0.1\" iyz=\"0\" izz=\"0.1\"/></inertial></link>" +
  "</robot>";

const snapCandidateUrdf =
  "<robot name=\"snap_axes\"><link name=\"base\"/><link name=\"tip\"/>" +
  "<joint name=\"j\" type=\"continuous\"><parent link=\"base\"/><child link=\"tip\"/><axis xyz=\"0 0.99999 0.00001\"/></joint></robot>";

const jointChainUrdf =
  "<robot name=\"joint_chain\"><link name=\"base\"/><link name=\"mid\"/><link name=\"tip\"/>" +
  "<joint name=\"j1\" type=\"revolute\"><parent link=\"base\"/><child link=\"mid\"/></joint>" +
  "<joint name=\"j2\" type=\"revolute\"><parent link=\"mid\"/><child link=\"tip\"/></joint></robot>";

const fingerprintUrdf =
  "<robot name=\"fingerprint_robot\"><link name=\"base\"/><link name=\"arm\"/>" +
  "<joint name=\"joint_a\" type=\"revolute\"><parent link=\"base\"/><child link=\"arm\"/>" +
  "<axis xyz=\"0 0 1\"/><origin xyz=\"0 0 0.1\" rpy=\"0 0 0\"/><limit lower=\"-1.57\" upper=\"1.57\"/></joint></robot>";

const fingerprintRenamedUrdf =
  "<robot name=\"fingerprint_robot_renamed\"><link name=\"foundation\"/><link name=\"tool\"/>" +
  "<joint name=\"joint_b\" type=\"revolute\"><parent link=\"foundation\"/><child link=\"tool\"/>" +
  "<axis xyz=\"0 0 1\"/><origin xyz=\"0 0 0.1\" rpy=\"0 0 0\"/><limit lower=\"-1.57\" upper=\"1.57\"/></joint></robot>";

const cylinderVertices = [];
for (const x of [-1, 1]) {
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    cylinderVertices.push(x, 0.5 * Math.cos(angle), 0.5 * Math.sin(angle));
  }
}
const syntheticCylinderBounds = {
  min: [-1, -0.5, -0.5],
  max: [1, 0.5, 0.5],
  size: [2, 1, 1],
  center: [0, 0, 0],
  vertices: new Float32Array(cylinderVertices),
};

const validate = lib.validateUrdf(urdf);
if (!validate.isValid) {
  throw new Error("ilu validate smoke test failed");
}

const browserParsed = browserLib.parseURDF(urdf);
if (
  !browserParsed.isValid ||
  browserLib.prettyPrintURDF(urdf).length === 0 ||
  browserLib.normalizeMeshPathForMatch("meshes\\part.stl") !== "meshes/part.stl"
) {
  throw new Error("ilu browser entry smoke test failed");
}
if (
  lib.resolveRepositoryXacroTargetPath(
    [{ path: "ur_description/urdf/ur10.urdf.xacro", type: "file" }],
    "ur_description/urdf/ur10.xacro"
  ) !== "ur_description/urdf/ur10.urdf.xacro"
) {
  throw new Error("ilu repository xacro target resolution smoke test failed");
}
const xacroPayload = lib.buildXacroExpandRequestPayload({
  targetPath: "ur_description/urdf/ur12e.urdf.xacro",
  files: [lib.createXacroFilePayloadFromText("ur_description/urdf/ur12e.urdf.xacro", "<robot/>")],
  args: {},
  useInorder: true,
});
if (
  !xacroPayload.files.some((file) => file.path === "ur_description/urdf/ur12e.xacro") ||
  !xacroPayload.files.some((file) => file.path === "ur_description/urdf/ur12e.urdf.xacro")
) {
  throw new Error("ilu xacro payload alias expansion smoke test failed");
}
const xacroRepositoryPayload = await xacroNode.buildXacroExpandPayloadFromRepository(
  [{ path: "ur_description/urdf/ur10.urdf.xacro", type: "file" }],
  "ur_description/urdf/ur10.xacro",
  async () => new Uint8Array(Buffer.from("<robot/>", "utf8"))
);
if (
  xacroRepositoryPayload.target_path !== "ur_description/urdf/ur10.urdf.xacro" ||
  !xacroRepositoryPayload.files.some((file) => file.path === "ur_description/urdf/ur10.urdf.xacro") ||
  !xacroRepositoryPayload.files.some((file) => file.path === "ur_description/urdf/ur10.xacro")
) {
  throw new Error("ilu repository xacro payload alias smoke test failed");
}
const descriptionAliasPayload = lib.buildXacroExpandRequestPayload({
  targetPath: "example_9/description/urdf/rrbot.urdf.xacro",
  files: [
    lib.createXacroFilePayloadFromText(
      "example_9/description/urdf/rrbot.urdf.xacro",
      "<robot/>"
    ),
    lib.createXacroFilePayloadFromText(
      "example_9/description/ros2_control/rrbot.ros2_control.xacro",
      "<robot/>"
    ),
  ],
  args: {},
  useInorder: true,
});
if (
  !descriptionAliasPayload.files.some(
    (file) => file.path === "example_9/urdf/rrbot.urdf.xacro"
  ) ||
  !descriptionAliasPayload.files.some(
    (file) => file.path === "example_9/ros2_control/rrbot.ros2_control.xacro"
  )
) {
  throw new Error("ilu xacro description-root alias smoke test failed");
}
const inspectedCandidates = await browserLib.inspectRepositoryCandidates(
  [{ path: "robot.urdf", name: "robot.urdf", hasMeshesFolder: false }],
  [{ path: "robot.urdf", name: "robot.urdf", type: "file" }],
  async () =>
    '<robot name="inspect_robot"><link name="base"><visual><geometry><mesh filename="meshes/missing.stl"/></geometry></visual></link></robot>',
  { maxCandidatesToInspect: 1 }
);
if (inspectedCandidates[0]?.unmatchedMeshReferences?.[0] !== "meshes/missing.stl") {
  throw new Error("ilu repository candidate inspection smoke test failed");
}
const xacroArgs = lib.extractXacroArgumentDefinitions(
  '<robot xmlns:xacro="http://www.ros.org/wiki/xacro">' +
    '<xacro:arg name="required_name"/>' +
    '<xacro:arg name="prefix" default=""/>' +
    '<xacro:arg name="mode" value="demo"/>' +
  "</robot>"
);
if (
  xacroArgs.length !== 3 ||
  xacroArgs[0]?.name !== "required_name" ||
  xacroArgs[0]?.isRequired !== true ||
  xacroArgs[1]?.name !== "prefix" ||
  xacroArgs[1]?.hasDefault !== true ||
  xacroArgs[1]?.defaultValue !== "" ||
  xacroArgs[2]?.name !== "mode" ||
  xacroArgs[2]?.defaultValue !== "demo"
) {
  throw new Error("ilu xacro arg extraction smoke test failed");
}
const inspectedXacroCandidates = await browserLib.inspectRepositoryCandidates(
  [{ path: "robot.urdf.xacro", name: "robot.urdf.xacro", hasMeshesFolder: false, isXacro: true }],
  [{ path: "robot.urdf.xacro", name: "robot.urdf.xacro", type: "file" }],
  async () =>
    '<robot xmlns:xacro="http://www.ros.org/wiki/xacro">' +
    '<xacro:arg name="robot_name"/>' +
    '<xacro:arg name="prefix" default="demo_"/>' +
    "</robot>",
  { maxCandidatesToInspect: 1 }
);
if (
  inspectedXacroCandidates[0]?.inspectionMode !== "xacro-source" ||
  inspectedXacroCandidates[0]?.xacroArgs?.[0]?.name !== "robot_name" ||
  inspectedXacroCandidates[0]?.xacroArgs?.[0]?.isRequired !== true ||
  inspectedXacroCandidates[0]?.xacroArgs?.[1]?.defaultValue !== "demo_"
) {
  throw new Error("ilu xacro candidate inspection smoke test failed");
}

const transmissionValidate = lib.validateUrdf(transmissionUrdf);
if (!transmissionValidate.isValid) {
  throw new Error("ilu transmission-aware validate smoke test failed");
}

const axes = lib.normalizeJointAxes(urdf);
if (!axes.urdfContent.includes("0.7071067812")) {
  throw new Error("ilu normalize-axes smoke test failed");
}

const snappedAxes = lib.snapJointAxes(snapCandidateUrdf);
if (
  !snappedAxes.urdfContent.includes('axis xyz="0 1 0"') ||
  snappedAxes.snapped.length !== 1
) {
  throw new Error("ilu snap-axes smoke test failed");
}

const meshes = lib.fixMeshPaths(urdf);
if (!meshes.urdfContent.includes("package://smoke_robot_description")) {
  throw new Error("ilu fix-mesh-paths smoke test failed");
}

const strippedForKinematics = urdfNode.stripUrdfForKinematics(urdf);
if (strippedForKinematics.includes("<visual") || strippedForKinematics.includes("<mesh")) {
  throw new Error("ilu strip-urdf-for-kinematics smoke test failed");
}

const canonicalFingerprint = urdfNode.computeKinematicFingerprint(fingerprintUrdf);
const renamedFingerprint = urdfNode.computeKinematicFingerprint(fingerprintRenamedUrdf);
if (
  !canonicalFingerprint.strict ||
  canonicalFingerprint.strict !== renamedFingerprint.strict ||
  urdfNode.computeSha256Text("smoke") !== urdfNode.computeSha256Text("smoke")
) {
  throw new Error("ilu kinematic-fingerprint smoke test failed");
}

const renamedJoint = lib.renameJointInUrdf(urdf, "j", "hinge_joint");
if (!renamedJoint.success || !renamedJoint.content.includes('joint name="hinge_joint"')) {
  throw new Error("ilu rename-joint library smoke test failed");
}

const renamedTransmissionJoint = lib.renameJointInUrdf(transmissionUrdf, "j", "hinge_joint");
if (
  !renamedTransmissionJoint.success ||
  !hasTagWithAttributes(renamedTransmissionJoint.content, "joint", [
    ["name", "hinge_joint"],
    ["type", "revolute"],
  ]) ||
  !renamedTransmissionJoint.content.includes('<transmission name="j_trans">') ||
  !renamedTransmissionJoint.content.includes('<joint name="hinge_joint">')
) {
  throw new Error("ilu transmission-aware rename-joint smoke test failed");
}

const renamedLink = lib.renameLinkInUrdf(urdf, "tip", "tool0");
if (!renamedLink.success || !renamedLink.content.includes('child link="tool0"')) {
  throw new Error("ilu rename-link library smoke test failed");
}

const removedTransmissionJoint = lib.removeJointsFromUrdf(transmissionUrdf, ["j"]);
if (
  !removedTransmissionJoint.success ||
  hasTagWithAttributes(removedTransmissionJoint.content, "joint", [
    ["name", "j"],
    ["type", "revolute"],
  ]) ||
  removedTransmissionJoint.content.includes('<transmission name="j_trans">')
) {
  throw new Error("ilu transmission-aware remove-joints smoke test failed");
}

const analysis = lib.analyzeUrdf(urdf);
if (analysis.robotName !== "smoke_robot" || analysis.linkNames.length !== 3) {
  throw new Error("ilu analyze smoke test failed");
}

const health = lib.healthCheckUrdf(badInertiaUrdf);
if (
  health.ok ||
  !health.findings.some((finding) => finding.code === "triangle-inequality") ||
  !health.findings.some((finding) => finding.code === "orientation-guess")
) {
  throw new Error("ilu health-check smoke test failed");
}

const zUpGuess = lib.guessUrdfOrientation(wheeledRobotZUp);
if (
  zUpGuess.likelyUpAxis !== "z" ||
  zUpGuess.likelyForwardAxis !== "x" ||
  !zUpGuess.likelyUpDirection ||
  zUpGuess.report.evidence.length < 3
) {
  throw new Error("ilu guess-orientation Z-up smoke test failed");
}

const yUpGuess = lib.guessUrdfOrientation(wheeledRobotYUp);
if (
  yUpGuess.likelyUpAxis !== "y" ||
  yUpGuess.likelyForwardAxis !== "x" ||
  !yUpGuess.likelyForwardDirection ||
  yUpGuess.report.evidence.length < 3
) {
  throw new Error("ilu guess-orientation Y-up smoke test failed");
}

const updatedAxis = lib.setJointAxisInUrdf(wheeledRobotZUp, "left_wheel_joint", [0, 0, 1]);
if (!updatedAxis.success || !updatedAxis.content.includes('axis xyz="0 0 1"')) {
  throw new Error("ilu set-joint-axis smoke test failed");
}

const autoFitBox = lib.autoFitCollisionGeometry(
  syntheticCylinderBounds,
  { xyz: [0, 0, 0], rpy: [0, 0, 0] },
  "box"
);
if (
  !autoFitBox ||
  autoFitBox.geometryType !== "box" ||
  autoFitBox.geometryParams.size !== "2 1 1"
) {
  throw new Error("ilu mesh auto-fit box smoke test failed");
}

const autoFitCylinder = lib.autoFitCollisionGeometry(
  syntheticCylinderBounds,
  { xyz: [0, 0, 0], rpy: [0, 0, 0] },
  "cylinder"
);
if (
  !autoFitCylinder ||
  autoFitCylinder.geometryType !== "cylinder" ||
  Number(autoFitCylinder.geometryParams.length) < 1.9 ||
  Number(autoFitCylinder.geometryParams.length) > 2.1 ||
  Number(autoFitCylinder.geometryParams.radius) < 0.45 ||
  Number(autoFitCylinder.geometryParams.radius) > 0.55
) {
  throw new Error("ilu mesh auto-fit cylinder smoke test failed");
}

const updatedJointLimits = lib.updateJointLimitsInUrdf(urdf, "j", -1.5, 1.5);
if (
  !updatedJointLimits.success ||
  !updatedJointLimits.content.includes('lower="-1.5"') ||
  !updatedJointLimits.content.includes('upper="1.5"')
) {
  throw new Error("ilu set-joint-limits smoke test failed");
}

const updatedJointVelocity = lib.updateJointVelocityInUrdf(updatedJointLimits.content, "j", 2.5);
if (
  !updatedJointVelocity.success ||
  !updatedJointVelocity.content.includes('velocity="2.5"')
) {
  throw new Error("ilu set-joint-velocity smoke test failed");
}

const updatedJointType = lib.updateJointTypeInUrdf(urdf, "j", "continuous");
if (
  !updatedJointType.success ||
  !hasTagWithAttributes(updatedJointType.content, "joint", [
    ["name", "j"],
    ["type", "continuous"],
  ]) ||
  updatedJointType.content.includes(' lower=')
) {
  throw new Error("ilu set-joint-type smoke test failed");
}

const reassignmentValidation = lib.validateJointLinkReassignment(
  jointChainUrdf,
  "j1",
  "tip",
  "mid"
);
if (reassignmentValidation.valid || !("error" in reassignmentValidation) || !/cycle/i.test(reassignmentValidation.error)) {
  throw new Error("ilu joint reassignment validation smoke test failed");
}

const safeReassignment = lib.updateJointLinksInUrdf(jointChainUrdf, "j2", "base", "tip");
if (
  !safeReassignment.success ||
  !hasTagWithAttributes(safeReassignment.content, "joint", [
    ["name", "j2"],
    ["type", "revolute"],
  ]) ||
  !safeReassignment.content.includes('<parent link="base"/>') ||
  !safeReassignment.content.includes('<child link="tip"/>')
) {
  throw new Error("ilu reassign-joint smoke test failed");
}

const updatedVisual = lib.updateVisualInLink(
  urdf,
  "mesh_link",
  0,
  "mesh",
  { filename: "meshes/updated.stl", scale: "1 1 1" },
  { xyz: [0, 0, 0], rpy: [0, 0, 0] },
  "#336699"
);
const updatedVisualData = lib.parseLinkData(updatedVisual.content, "mesh_link");
if (
  !updatedVisual.success ||
  updatedVisualData?.visuals[0]?.geometry.params.filename !== "meshes/updated.stl" ||
  updatedVisualData.visuals[0]?.materialColor !== "#336699"
) {
  throw new Error("ilu update-visual smoke test failed");
}

const addedCollision = lib.addCollisionToLink(
  urdf,
  "mesh_link",
  "box",
  { size: "1 2 3" },
  { xyz: [0, 0, 0], rpy: [0, 0, 0] }
);
const addedCollisionData = lib.parseLinkData(addedCollision.content, "mesh_link");
if (
  !addedCollision.success ||
  addedCollisionData?.collisions.length !== 1 ||
  addedCollisionData.collisions[0]?.geometry.type !== "box" ||
  addedCollisionData.collisions[0]?.geometry.params.size !== "1 2 3"
) {
  throw new Error("ilu add-collision smoke test failed");
}

const removedCollision = lib.removeCollisionFromLink(addedCollision.content, "mesh_link", 0);
if (!removedCollision.success || removedCollision.content.includes("<collision>")) {
  throw new Error("ilu remove-collision smoke test failed");
}

const addedInertial = lib.addInertialToLink(
  urdf,
  "mesh_link",
  2,
  { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
  { xyz: [0, 0, 0], rpy: [0, 0, 0] }
);
const addedInertialData = lib.parseLinkData(addedInertial.content, "mesh_link");
if (
  !addedInertial.success ||
  addedInertialData?.inertial?.mass !== 2 ||
  addedInertialData.inertial?.inertia.ixx !== 1 ||
  addedInertialData.inertial?.inertia.izz !== 1
) {
  throw new Error("ilu add-inertial smoke test failed");
}

const removedInertial = lib.removeInertialFromLink(addedInertial.content, "mesh_link");
if (!removedInertial.success || removedInertial.content.includes("<inertial>")) {
  throw new Error("ilu remove-inertial smoke test failed");
}

const canonicalized = lib.canonicalizeJointFrames(wheeledRobotZUp, {
  targetAxis: "z",
});
if (
  !canonicalized.success ||
  !canonicalized.changedJoints.includes("left_wheel_joint") ||
  !canonicalized.content.includes('axis xyz="0 0 1"')
) {
  throw new Error("ilu canonicalize-joint-frame smoke test failed");
}

const orientedYUp = lib.applyOrientationToRobot(wheeledRobotYUp, {
  sourceUpAxis: "y",
  sourceForwardAxis: "x",
  targetUpAxis: "z",
  targetForwardAxis: "x",
});
const reGuessedYUp = lib.guessUrdfOrientation(orientedYUp);
if (reGuessedYUp.likelyUpAxis !== "z") {
  throw new Error("ilu apply-orientation smoke test failed");
}

const normalizeDryRun = lib.normalizeRobot(wheeledRobotYUp, {
  snapAxes: true,
  canonicalizeJointFrame: true,
});
if (
  normalizeDryRun.apply ||
  !normalizeDryRun.plannedSteps.some((step) => step.name === "canonicalize-joint-frame" && step.enabled)
) {
  throw new Error("ilu normalize-robot dry-run smoke test failed");
}

const normalizeApply = lib.normalizeRobot(wheeledRobotYUp, {
  apply: true,
  snapAxes: true,
  canonicalizeJointFrame: true,
  sourceUpAxis: "y",
  sourceForwardAxis: "x",
  targetUpAxis: "+z",
  targetForwardAxis: "+x",
});
if (!normalizeApply.apply || !normalizeApply.outputUrdf || !normalizeApply.healthAfter) {
  throw new Error("ilu normalize-robot apply smoke test failed");
}

const diff = lib.compareUrdfs(urdf, renamedJoint.content);
if (diff.areEqual || diff.differenceCount < 1) {
  throw new Error("ilu diff smoke test failed");
}

const meshAssets = lib.updateMeshPathsToAssetsInUrdf(urdf);
if (!meshAssets.success || !meshAssets.content.includes('mesh filename="assets/abs/path/mesh.stl"')) {
  throw new Error("ilu mesh-to-assets smoke test failed");
}

const mjcf = lib.convertURDFToMJCF(urdf);
if (!mjcf.mjcfContent.includes("<mujoco")) {
  throw new Error("ilu urdf-to-mjcf smoke test failed");
}

const xacro = lib.convertURDFToXacro(xacroRegressionUrdf);
if (!xacro.xacroContent.includes("xacro:property")) {
  throw new Error("ilu urdf-to-xacro smoke test failed");
}
if (!hasTagWithAttributes(xacro.xacroContent, "robot", [["name", "so101_robot"]])) {
  throw new Error("ilu urdf-to-xacro robot name regression smoke test failed");
}
if (!xacro.xacroContent.includes('mesh filename="assets/sts3215_03a_v1.stl"')) {
  throw new Error("ilu urdf-to-xacro mesh filename regression smoke test failed");
}
if (!xacro.xacroContent.includes('material name="sts3215"')) {
  throw new Error("ilu urdf-to-xacro material name regression smoke test failed");
}
if (xacro.xacroContent.includes('name="so${') || xacro.xacroContent.includes('filename="assets/${')) {
  throw new Error("ilu urdf-to-xacro unsafe substitution regression smoke test failed");
}
if (xacro.xacroContent.includes("${yaw}") || xacro.xacroContent.includes('name="yaw" value="0"')) {
  throw new Error("ilu urdf-to-xacro identity-value regression smoke test failed");
}

const repoRef = lib.parseGitHubRepositoryReference("https://github.com/acme/robot-repo/tree/main/robots/arm");
if (!repoRef || repoRef.owner !== "acme" || repoRef.repo !== "robot-repo" || repoRef.ref !== "main" || repoRef.path !== "robots/arm") {
  throw new Error("ilu GitHub repository parsing smoke test failed");
}

const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-smoke-"));
fs.mkdirSync(path.join(tempRepo, "meshes"), { recursive: true });
fs.writeFileSync(path.join(tempRepo, "robot.urdf"), urdf, "utf8");
fs.writeFileSync(path.join(tempRepo, "._robot.urdf"), "not a urdf", "utf8");
fs.writeFileSync(path.join(tempRepo, "meshes", "mesh.stl"), "solid mesh\nendsolid mesh\n", "utf8");
const localSummary = await localLib.inspectLocalRepositoryUrdfs({ path: tempRepo });
if (
  localSummary.candidateCount !== 1 ||
  localSummary.primaryCandidatePath !== "robot.urdf"
) {
  throw new Error("ilu local repository inspection smoke test failed");
}

const loadedUrdfFile = await loadSourceNode.loadSourceFromPath({
  path: path.join(tempRepo, "robot.urdf"),
});
if (loadedUrdfFile.entryFormat !== "urdf" || !loadedUrdfFile.urdf.includes('robot name="smoke_robot"')) {
  throw new Error("ilu load-source local file smoke test failed");
}

const originalFetch = globalThis.fetch;
const gitHubFetchUrls = [];
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  gitHubFetchUrls.push(url);

  if (url === "https://api.github.com/repos/acme/robot-repo/git/trees/main?recursive=1") {
    return new Response(
      JSON.stringify({
        tree: [
          { path: "robots", type: "tree" },
          { path: "robots/demo.urdf", type: "blob", sha: "demo-urdf-sha", size: 64 },
        ],
      }),
      { status: 200 }
    );
  }

  if (url === "https://api.github.com/repos/acme/robot-repo/git/blobs/demo-urdf-sha") {
    return new Response(
      JSON.stringify({
        content: Buffer.from(
          '<robot name="demo"><link name="base"/></robot>',
          "utf8"
        ).toString("base64"),
        encoding: "base64",
      }),
      { status: 200 }
    );
  }

  throw new Error(`Unexpected GitHub smoke fetch: ${url}`);
};

try {
  const loadedGitHubUrdf = await loadSourceNode.loadSourceFromGitHub({
    reference: {
      owner: "acme",
      repo: "robot-repo",
      ref: "main",
    },
    entryPath: "robots/demo.urdf",
  });
  if (
    loadedGitHubUrdf.entryFormat !== "urdf" ||
    !loadedGitHubUrdf.urdf.includes('robot name="demo"')
  ) {
    throw new Error("ilu load-source GitHub explicit entry smoke test failed");
  }
  const treeFetchCount = gitHubFetchUrls.filter((url) => url.includes("/git/trees/")).length;
  const blobFetchCount = gitHubFetchUrls.filter((url) => url.includes("/git/blobs/")).length;
  if (treeFetchCount !== 1 || blobFetchCount !== 1) {
    throw new Error("ilu load-source GitHub explicit entry fetch-count smoke test failed");
  }
} finally {
  globalThis.fetch = originalFetch;
}

const brokenRepoUrdf =
  "<robot name=\"smoke_robot\"><link name=\"mesh_link\"><visual><geometry>" +
  "<mesh filename=\"mesh.stl\"/></geometry></visual></link></robot>";
fs.mkdirSync(path.join(tempRepo, "urdf"), { recursive: true });
fs.writeFileSync(path.join(tempRepo, "urdf", "robot.urdf"), brokenRepoUrdf, "utf8");

const repairedLib = lib.fixMissingMeshReferencesInRepository(brokenRepoUrdf, "urdf/robot.urdf", [
  { path: "urdf", type: "dir" },
  { path: "urdf/robot.urdf", type: "file" },
  { path: "meshes", type: "dir" },
  { path: "meshes/mesh.stl", type: "file" },
]);
if (!repairedLib.success || !repairedLib.content.includes('mesh filename="../meshes/mesh.stl"')) {
  throw new Error("ilu repo mesh repair library smoke test failed");
}

const repairedLocal = await localLib.repairLocalRepositoryMeshReferences(
  { path: tempRepo },
  { urdfPath: "urdf/robot.urdf" }
);
if (!repairedLocal.success || repairedLocal.corrections.length !== 1) {
  throw new Error("ilu local mesh repair smoke test failed");
}

const matchedResourceFiles = lib.collectPackageResourceFilesForMatchedFiles(
  [
    { path: "smoke_robot/package.xml", type: "file" },
    { path: "smoke_robot/meshes/visual/base.dae", type: "file" },
    { path: "smoke_robot/textures/base.png", type: "file" },
  ],
  [{ path: "smoke_robot/meshes/visual/base.dae", type: "file" }],
  { smoke_robot: ["smoke_robot"] }
);
if (!matchedResourceFiles.some((file) => file.path === "smoke_robot/textures/base.png")) {
  throw new Error("ilu matched package resource collection smoke test failed");
}

const wrongPathRepoUrdf =
  "<robot name=\"smoke_robot\"><link name=\"mesh_link\"><visual><geometry>" +
  "<mesh filename=\"wrongdir/mesh.stl\"/></geometry></visual></link></robot>";
fs.writeFileSync(path.join(tempRepo, "robot-wrongdir.urdf"), wrongPathRepoUrdf, "utf8");

const repairedWrongPath = await localLib.repairLocalRepositoryMeshReferences(
  { path: tempRepo },
  { urdfPath: "robot-wrongdir.urdf" }
);
if (
  !repairedWrongPath.success ||
  repairedWrongPath.corrections.length !== 1 ||
  !repairedWrongPath.content.includes('mesh filename="meshes/mesh.stl"')
) {
  throw new Error("ilu wrong-path mesh repair smoke test failed");
}

const binaryMeshPath = path.join(tempRepo, "meshes", "binary.stl");
const header = Buffer.alloc(80, 0x20);
Buffer.from("smoke-binary-stl").copy(header);
const triangleRecords = Buffer.alloc(84 + 2 * 50);
header.copy(triangleRecords, 0);
triangleRecords.writeUInt32LE(2, 80);
const triangleData = [
  [0, 0, 0, 1, 0, 0, 0, 1, 0],
  [0.0001, 0, 0, 1.0001, 0, 0, 0.0001, 1, 0],
];
let triangleOffset = 84;
for (const triangle of triangleData) {
  triangleOffset += 12;
  for (const value of triangle) {
    triangleRecords.writeFloatLE(value, triangleOffset);
    triangleOffset += 4;
  }
  triangleOffset += 2;
}
fs.writeFileSync(binaryMeshPath, triangleRecords);

const meshInspection = meshNode.inspectMeshes({
  meshDir: path.join(tempRepo, "meshes"),
  maxFaces: 1,
  meshes: ["binary.stl"],
});
if (
  meshInspection.overLimit !== 1 ||
  meshInspection.missingMeshes.length !== 0 ||
  meshInspection.results[0]?.targetMaxFaces !== 1
) {
  throw new Error("ilu inspect-meshes smoke test failed");
}

const mujocoMeshPrepResult = meshNode.compressMeshes({
  meshDir: path.join(tempRepo, "meshes"),
  maxFaces: 1,
  meshes: ["binary.stl"],
});
if (
  mujocoMeshPrepResult.overLimit !== 1 ||
  !mujocoMeshPrepResult.results[0]?.reason?.includes("Above target face limit")
) {
  throw new Error("ilu MuJoCo mesh prep smoke test failed");
}

const xacroRuntime = await xacroNode.probeXacroRuntime({
  pythonExecutable: process.env.I_LOVE_URDF_XACRO_PYTHON,
});
if (xacroRuntime.available) {
  fs.writeFileSync(
    path.join(tempRepo, "package.xml"),
    "<package><name>smoke_robot</name></package>",
    "utf8"
  );
  fs.mkdirSync(path.join(tempRepo, "include"), { recursive: true });
  fs.writeFileSync(
    path.join(tempRepo, "materials.xacro"),
    "<?xml version=\"1.0\"?>\n" +
      "<robot xmlns:xacro=\"http://www.ros.org/wiki/xacro\">\n" +
      "  <material name=\"silver\"/>\n" +
      "</robot>\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(tempRepo, "include", "shared.xacro"),
    "<?xml version=\"1.0\"?>\n" +
      "<robot xmlns:xacro=\"http://www.ros.org/wiki/xacro\">\n" +
      "  <xacro:macro name=\"shared_link\" params=\"suffix\">\n" +
      "    <link name=\"shared_${suffix}\"/>\n" +
      "  </xacro:macro>\n" +
      "</robot>\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(tempRepo, "robot.urdf.xacro"),
    "<?xml version=\"1.0\"?>\n" +
      "<robot name=\"smoke_robot\" xmlns:xacro=\"http://www.ros.org/wiki/xacro\">\n" +
      "  <xacro:include filename=\"$(find smoke_robot)/include/shared.xacro\"/>\n" +
      "  <xacro:include filename=\"$(find smoke_robot)/materials.xacro\"/>\n" +
      "  <link name=\"base\"/>\n" +
      "  <link name=\"mesh_link\"><visual><geometry><mesh filename=\"file://$(find smoke_robot)/meshes/mesh.stl\"/></geometry></visual></link>\n" +
      "  <xacro:shared_link suffix=\"tip\"/>\n" +
      "</robot>\n",
    "utf8"
  );

  const xacroSummary = await localLib.inspectLocalRepositoryUrdfs({ path: tempRepo });
  if (xacroSummary.candidates.some((candidate) => candidate.path === "materials.xacro")) {
    throw new Error("ilu xacro candidate filtering smoke test failed");
  }

  const expanded = await xacroNode.expandLocalXacroToUrdf({
    xacroPath: path.join(tempRepo, "robot.urdf.xacro"),
    rootPath: tempRepo,
    pythonExecutable: process.env.I_LOVE_URDF_XACRO_PYTHON,
  });
  if (!expanded.urdf.includes('link name="shared_tip"')) {
    throw new Error("ilu xacro-to-urdf smoke test failed");
  }
  if (
    expanded.urdf.includes("i-love-urdf-xacro-") ||
    !expanded.urdf.includes('mesh filename="meshes/mesh.stl"')
  ) {
    throw new Error("ilu expanded xacro mesh-path stabilization smoke test failed");
  }

  const loadedXacroRepo = await loadSourceNode.loadSourceFromPath({
    path: tempRepo,
    entryPath: "robot.urdf.xacro",
    pythonExecutable: process.env.I_LOVE_URDF_XACRO_PYTHON,
  });
  if (loadedXacroRepo.entryFormat !== "xacro" || !loadedXacroRepo.urdf.includes('link name="shared_tip"')) {
    throw new Error("ilu load-source xacro repository smoke test failed");
  }
  if (
    loadedXacroRepo.urdf.includes("i-love-urdf-xacro-") ||
    !loadedXacroRepo.urdf.includes('mesh filename="meshes/mesh.stl"')
  ) {
    throw new Error("ilu load-source xacro mesh-path stabilization smoke test failed");
  }
}

const cliSource = fs.readFileSync(path.join(root, "dist", "cli.js"), "utf8");
if (
  !cliSource.includes("health-check") ||
  !cliSource.includes("snap-axes") ||
  !cliSource.includes("set-joint-type") ||
  !cliSource.includes("set-joint-limits") ||
  !cliSource.includes("set-joint-velocity") ||
  !cliSource.includes("canonicalize-joint-frame") ||
  !cliSource.includes("normalize-robot") ||
  !cliSource.includes("setup-xacro-runtime") ||
  !cliSource.includes("load-source") ||
  !cliSource.includes("--entry <repo-path>") ||
  !cliSource.includes("compress-meshes") ||
  !cliSource.includes("inspect-meshes")
) {
  throw new Error("ilu CLI surface smoke test failed");
}

console.log("ilu smoke test passed.");

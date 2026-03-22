#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";
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
const commandConsistency = await import(path.join(root, "dist", "commands", "commandConsistency.js"));
const cliPath = path.join(root, "dist", "cli.js");

installDomGlobals();
commandConsistency.assertCommandConsistency();

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

const mobileManipulatorUrdf =
  "<robot name=\"dual_arm_mobile\">" +
  "<link name=\"base_link\"/>" +
  "<link name=\"left_shoulder_link\"/>" +
  "<link name=\"left_tool_link\"/>" +
  "<link name=\"right_shoulder_link\"/>" +
  "<link name=\"right_tool_link\"/>" +
  "<link name=\"front_left_wheel_link\"/>" +
  "<link name=\"front_right_wheel_link\"/>" +
  "<link name=\"rear_left_wheel_link\"/>" +
  "<link name=\"rear_right_wheel_link\"/>" +
  "<joint name=\"left_shoulder_joint\" type=\"revolute\"><parent link=\"base_link\"/><child link=\"left_shoulder_link\"/></joint>" +
  "<joint name=\"left_wrist_joint\" type=\"revolute\"><parent link=\"left_shoulder_link\"/><child link=\"left_tool_link\"/></joint>" +
  "<joint name=\"right_shoulder_joint\" type=\"revolute\"><parent link=\"base_link\"/><child link=\"right_shoulder_link\"/></joint>" +
  "<joint name=\"right_wrist_joint\" type=\"revolute\"><parent link=\"right_shoulder_link\"/><child link=\"right_tool_link\"/></joint>" +
  "<joint name=\"front_left_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"front_left_wheel_link\"/></joint>" +
  "<joint name=\"front_right_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"front_right_wheel_link\"/></joint>" +
  "<joint name=\"rear_left_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"rear_left_wheel_link\"/></joint>" +
  "<joint name=\"rear_right_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"rear_right_wheel_link\"/></joint>" +
  "</robot>";

const humanoidSmokeUrdf =
  "<robot name=\"humanoid_smoke\">" +
  "<link name=\"torso\"/><link name=\"left_leg\"/><link name=\"right_leg\"/><link name=\"left_arm\"/><link name=\"right_arm\"/>" +
  "<joint name=\"left_hip\" type=\"revolute\"><parent link=\"torso\"/><child link=\"left_leg\"/></joint>" +
  "<joint name=\"right_hip\" type=\"revolute\"><parent link=\"torso\"/><child link=\"right_leg\"/></joint>" +
  "<joint name=\"left_shoulder\" type=\"revolute\"><parent link=\"torso\"/><child link=\"left_arm\"/></joint>" +
  "<joint name=\"right_shoulder\" type=\"revolute\"><parent link=\"torso\"/><child link=\"right_arm\"/></joint>" +
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
const browserXacroArgs = browserLib.extractXacroArgumentDefinitions(
  '<robot xmlns:xacro="http://www.ros.org/wiki/xacro"><xacro:arg name="robot_name"/></robot>'
);
if (browserXacroArgs[0]?.name !== "robot_name") {
  throw new Error("ilu browser xacro arg extraction smoke test failed");
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
const normalizedSingleAxis = lib.normalizeJointAxis("0.01 0.98 0");
if (
  Math.abs(normalizedSingleAxis[0]) > 0.02 ||
  Math.abs(normalizedSingleAxis[1] - 1) > 0.001 ||
  Math.abs(normalizedSingleAxis[2]) > 0.02
) {
  throw new Error("ilu normalize-joint-axis smoke test failed");
}
if (lib.sanitizeNames("Link 1.With-Hyphen") !== "link_1_with_hyphen") {
  throw new Error("ilu sanitize-names smoke test failed");
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
  !renamedTransmissionJoint.content.includes('joint name="hinge_joint" type="revolute"') ||
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
  removedTransmissionJoint.content.includes('joint name="j" type="revolute"') ||
  removedTransmissionJoint.content.includes('<transmission name="j_trans">')
) {
  throw new Error("ilu transmission-aware remove-joints smoke test failed");
}

const analysis = lib.analyzeUrdf(urdf);
if (analysis.robotName !== "smoke_robot" || analysis.linkNames.length !== 3) {
  throw new Error("ilu analyze smoke test failed");
}

if (
  lib.identifyRobotType(urdf) !== "arm" ||
  lib.identifyRobotType(mobileManipulatorUrdf) !== "wheeled" ||
  lib.identifyRobotType(humanoidSmokeUrdf) !== "humanoid" ||
  browserLib.identifyRobotType(mobileManipulatorUrdf) !== "wheeled"
) {
  throw new Error("ilu identifyRobotType smoke test failed");
}

const updatedAxis = lib.setJointAxisInUrdf(wheeledRobotZUp, "left_wheel_joint", [0, 0, 1]);
if (!updatedAxis.success || !updatedAxis.content.includes('axis xyz="0 0 1"')) {
  throw new Error("ilu set-joint-axis smoke test failed");
}

const rotatedTensor = lib.rotateInertiaTensor(
  { ixx: 1, ixy: 0, ixz: 0, iyy: 2, iyz: 0, izz: 3 },
  [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ]
);
if (
  Math.abs(rotatedTensor.ixx - 2) > 1e-9 ||
  Math.abs(rotatedTensor.iyy - 1) > 1e-9 ||
  Math.abs(rotatedTensor.izz - 3) > 1e-9
) {
  throw new Error("ilu rotateInertiaTensor smoke test failed");
}

const thresholdedTensor = lib.fixInertiaThresholds(
  { ixx: 1e-10, ixy: 1e-12, ixz: 0.2, iyy: 0.5, iyz: -1e-11, izz: 0.6 },
  1e-8
);
if (
  thresholdedTensor.ixx !== 0 ||
  thresholdedTensor.ixy !== 0 ||
  thresholdedTensor.ixz !== 0.2 ||
  thresholdedTensor.iyz !== 0
) {
  throw new Error("ilu fixInertiaThresholds smoke test failed");
}

if (
  lib.resolvePackagePaths("package://robot_description/meshes/base.stl", {
    robot_description: "/tmp/robot_description",
  }) !== "/tmp/robot_description/meshes/base.stl" ||
  browserLib.resolvePackagePaths("file:///tmp/base.stl", new Map()) !== "/tmp/base.stl"
) {
  throw new Error("ilu resolvePackagePaths smoke test failed");
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
  !(
    updatedJointLimits.content.includes('limit lower="-1.5" upper="1.5"') ||
    updatedJointLimits.content.includes('limit upper="1.5" lower="-1.5"')
  )
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
  !updatedJointType.content.includes('joint name="j" type="continuous"') ||
  updatedJointType.content.includes(' lower=')
) {
  throw new Error("ilu set-joint-type smoke test failed");
}
const alignedJoint = lib.alignJointToLocalZ(jointChainUrdf, "j1");
if (
  !alignedJoint.success ||
  !alignedJoint.changedJoints.includes("j1") ||
  !alignedJoint.content.includes('axis xyz="0 0 1"')
) {
  throw new Error("ilu align-joint-to-local-z smoke test failed");
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
  !safeReassignment.content.includes('joint name="j2" type="revolute"><parent link="base"/><child link="tip"/>')
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

const diff = lib.compareUrdfs(urdf, renamedJoint.content);
if (diff.areEqual || diff.differenceCount < 1) {
  throw new Error("ilu diff smoke test failed");
}

const loadedSourceRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-loaded-source-"));
const loadedSourceUrdfDir = path.join(loadedSourceRepoDir, "urdf");
const loadedSourceMeshDir = path.join(loadedSourceRepoDir, "meshes");
fs.mkdirSync(loadedSourceUrdfDir, { recursive: true });
fs.mkdirSync(loadedSourceMeshDir, { recursive: true });

meshNode.writeBinaryStl(
  path.join(loadedSourceMeshDir, "base.stl"),
  Buffer.alloc(80, 0),
  Float32Array.from([
    0, -0.2, -0.1,
    1, -0.2, -0.1,
    0, 0.2, 0.1,
    1, -0.2, -0.1,
    1, 0.2, 0.1,
    0, 0.2, 0.1,
  ])
);
fs.writeFileSync(
  path.join(loadedSourceMeshDir, "base_ascii.stl"),
  [
    "solid base_ascii",
    "facet normal 0 0 1",
    "outer loop",
    "vertex 0 -0.2 -0.1",
    "vertex 1 -0.2 -0.1",
    "vertex 0 0.2 0.1",
    "endloop",
    "endfacet",
    "facet normal 0 0 1",
    "outer loop",
    "vertex 1 -0.2 -0.1",
    "vertex 1 0.2 0.1",
    "vertex 0 0.2 0.1",
    "endloop",
    "endfacet",
    "endsolid base_ascii",
    "",
  ].join("\n"),
  "utf8"
);
fs.writeFileSync(
  path.join(loadedSourceMeshDir, "arm.obj"),
  [
    "o arm",
    "v -0.1 0 0",
    "v 0.2 0.1 1.4",
    "v 0 0.3 0.6",
    "f 1 2 3",
    "",
  ].join("\n"),
  "utf8"
);
fs.writeFileSync(
  path.join(loadedSourceMeshDir, "mast.dae"),
  [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<COLLADA version=\"1.4.1\">",
    "  <library_geometries>",
    "    <geometry id=\"mast\">",
    "      <mesh>",
    "        <source id=\"mast-positions\">",
    "          <float_array id=\"mast-positions-array\" count=\"9\">0 0 0 0.2 0.1 1.5 -0.1 0.3 1.2</float_array>",
    "          <technique_common>",
    "            <accessor source=\"#mast-positions-array\" count=\"3\" stride=\"3\">",
    "              <param name=\"X\" type=\"float\"/>",
    "              <param name=\"Y\" type=\"float\"/>",
    "              <param name=\"Z\" type=\"float\"/>",
    "            </accessor>",
    "          </technique_common>",
    "        </source>",
    "      </mesh>",
    "    </geometry>",
    "  </library_geometries>",
    "</COLLADA>",
    "",
  ].join("\n"),
  "utf8"
);
fs.writeFileSync(path.join(loadedSourceMeshDir, "future.glb"), "glTF", "utf8");

const asciiBounds = meshNode.readStlBounds(path.join(loadedSourceMeshDir, "base_ascii.stl"));
if (
  asciiBounds.isBinary ||
  asciiBounds.vertexCount !== 6 ||
  asciiBounds.min[0] !== 0 ||
  asciiBounds.max[0] !== 1
) {
  throw new Error("ilu ASCII STL bounds smoke test failed");
}

const browserAsciiStlBuffer = fs.readFileSync(path.join(loadedSourceMeshDir, "base_ascii.stl"));
const browserAsciiBounds = browserLib.computeMeshBoundsFromArrayBuffer(
  browserAsciiStlBuffer.buffer.slice(
    browserAsciiStlBuffer.byteOffset,
    browserAsciiStlBuffer.byteOffset + browserAsciiStlBuffer.byteLength
  ),
  "1 1 1"
);
if (
  !browserAsciiBounds ||
  Math.abs(browserAsciiBounds.max[0] - 1) > 1e-6 ||
  Math.abs(browserAsciiBounds.max[1] - 0.2) > 1e-6 ||
  Math.abs(browserAsciiBounds.min[2] + 0.1) > 1e-6
) {
  throw new Error("ilu browser mesh bounds smoke test failed");
}

const browserMeshBlobMap = {
  "robots/pkg_a/meshes/link.stl": new Blob(["a"]),
  "robots/pkg_b/meshes/other.stl": new Blob(["b"]),
};
const browserPackageRoots = browserLib.buildPackageRootsFromMeshBlobMap(browserMeshBlobMap);
if (browserPackageRoots.pkg_a?.[0] !== "robots/pkg_a") {
  throw new Error("ilu browser package-root inference smoke test failed");
}

const browserResolvedMesh = browserLib.resolveMeshBlobFromReference(
  "package://pkg_a/meshes/link.stl",
  browserMeshBlobMap,
  "robots/pkg_a/urdf",
  browserPackageRoots
);
if (
  !browserResolvedMesh ||
  browserResolvedMesh.path !== "robots/pkg_a/meshes/link.stl" ||
  browserLib.stripMeshSchemes("package://pkg_a/meshes/link.stl") !== "meshes/link.stl"
) {
  throw new Error("ilu browser mesh resolver smoke test failed");
}

const browserMeshCandidates = browserLib.resolveMeshCandidates({
  ref: "package://pkg_a/meshes/link.obj",
  meshFiles: browserMeshBlobMap,
  urdfBasePath: "robots/pkg_a/urdf",
  packageRoots: browserPackageRoots,
});
if (
  browserMeshCandidates.length !== 1 ||
  browserMeshCandidates[0]?.resolvedPath !== "robots/pkg_a/meshes/link.stl"
) {
  throw new Error("ilu browser mesh candidates smoke test failed");
}

const browserResolvedResource = browserLib.resolveMeshResourceBlob(
  "textures/base.png",
  { "robots/pkg_a/meshes/textures/base.png": new Blob(["tex"]) },
  "robots/pkg_a/meshes"
);
if (!browserResolvedResource || browserResolvedResource.path !== "robots/pkg_a/meshes/textures/base.png") {
  throw new Error("ilu browser mesh resource resolver smoke test failed");
}
const browserRepairedMissingMeshRefs = browserLib.fixMissingMeshReferences(
  `<?xml version="1.0"?>
<robot name="mesh_repair">
  <link name="base_link">
    <visual><geometry><mesh filename="mesh.stl" /></geometry></visual>
  </link>
</robot>`,
  { "meshes/mesh.stl": new Blob(["solid mesh\nendsolid mesh\n"]) },
  { basePath: "urdf" }
);
if (
  !browserRepairedMissingMeshRefs.success ||
  browserRepairedMissingMeshRefs.corrections[0]?.corrected !== "../meshes/mesh.stl"
) {
  throw new Error("ilu browser missing-mesh repair smoke test failed");
}

const browserUrdfDocument = browserLib.parseUrdfDocument(urdf);
if (
  !browserUrdfDocument ||
  browserLib.getUrdfElementByName(browserUrdfDocument, "joint", "j")?.getAttribute("name") !== "j" ||
  !browserLib.serializeUrdfDocument(browserUrdfDocument).includes('robot name="smoke_robot"')
) {
  throw new Error("ilu browser URDF document smoke test failed");
}

const objBounds = meshNode.readMeshBounds(path.join(loadedSourceMeshDir, "arm.obj"));
if (
  objBounds.format !== "obj" ||
  objBounds.vertexCount !== 3 ||
  objBounds.min[0] !== -0.1 ||
  objBounds.max[2] !== 1.4
) {
  throw new Error("ilu OBJ bounds smoke test failed");
}

const daeBounds = meshNode.readMeshBounds(path.join(loadedSourceMeshDir, "mast.dae"));
if (
  daeBounds.format !== "dae" ||
  daeBounds.vertexCount !== 3 ||
  daeBounds.max[2] !== 1.5 ||
  daeBounds.min[0] !== -0.1
) {
  throw new Error("ilu DAE bounds smoke test failed");
}

const loadedSourceRepoUrdf =
  "<robot name=\"loaded_source_robot\">" +
  "<link name=\"base\">" +
  "<visual><geometry><mesh filename=\"../meshes/base_ascii.stl\"/></geometry></visual>" +
  "<visual><geometry><mesh filename=\"../meshes/arm.obj\"/></geometry></visual>" +
  "<visual><geometry><mesh filename=\"../meshes/mast.dae\"/></geometry></visual>" +
  "<visual><geometry><mesh filename=\"../meshes/future.glb\"/></geometry></visual>" +
  "<visual><geometry><mesh filename=\"../meshes/missing.stl\"/></geometry></visual>" +
  "</link>" +
  "<link name=\"left_wheel\"><collision><origin xyz=\"0 0 0\" rpy=\"1.57079632679 0 0\"/><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<link name=\"right_wheel\"><collision><origin xyz=\"0 0 0\" rpy=\"1.57079632679 0 0\"/><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<joint name=\"left_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"left_wheel\"/><origin xyz=\"0 0.3 -0.1\" rpy=\"0 0 0\"/><axis xyz=\"0 1 0\"/></joint>" +
  "<joint name=\"right_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"right_wheel\"/><origin xyz=\"0 -0.3 -0.1\" rpy=\"0 0 0\"/><axis xyz=\"0 1 0\"/></joint>" +
  "</robot>";
fs.writeFileSync(path.join(loadedSourceUrdfDir, "robot.urdf"), loadedSourceRepoUrdf, "utf8");

const loadedSource = await loadSourceNode.loadSourceFromPath({
  path: loadedSourceRepoDir,
  entryPath: "urdf/robot.urdf",
});

const loadedOrientation = await urdfNode.guessLoadedSourceOrientation(loadedSource);
if (
  !loadedOrientation.meshAudit.usedFilesystemChecks ||
  !loadedOrientation.meshAudit.sampledMeshFiles.includes("../meshes/base_ascii.stl") ||
  !loadedOrientation.meshAudit.sampledMeshFiles.includes("../meshes/arm.obj") ||
  !loadedOrientation.meshAudit.sampledMeshFiles.includes("../meshes/mast.dae") ||
  !loadedOrientation.meshAudit.skippedUnsupportedMeshes.includes("../meshes/future.glb") ||
  !loadedOrientation.meshAudit.unresolvedMeshReferences.includes("../meshes/missing.stl")
) {
  throw new Error("ilu guessLoadedSourceOrientation smoke test failed");
}

const loadedOrientationCard = await urdfNode.buildLoadedSourceOrientationCard(loadedSource);
if (
  !loadedOrientationCard.summary.classification.endsWith("-up") ||
  !loadedOrientationCard.meshAudit.sampledMeshFiles.includes("../meshes/base_ascii.stl") ||
  !loadedOrientationCard.meshAudit.sampledMeshFiles.includes("../meshes/arm.obj")
) {
  throw new Error("ilu buildLoadedSourceOrientationCard smoke test failed");
}

const loadedHealth = await urdfNode.checkLoadedSourcePhysicsHealth(loadedSource);
if (
  loadedHealth.ok ||
  !loadedHealth.findings.some((finding) => finding.code === "missing-mesh-file") ||
  !loadedHealth.findings.some((finding) => finding.code === "unsupported-mesh-bounds-format") ||
  !loadedHealth.meshAudit.skippedUnsupportedMeshes.includes("../meshes/future.glb") ||
  !loadedHealth.meshAudit.unresolvedMeshReferences.includes("../meshes/missing.stl")
) {
  throw new Error("ilu checkLoadedSourcePhysicsHealth smoke test failed");
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
if (!xacro.xacroContent.includes("<robot") || !xacro.xacroContent.includes('name="so101_robot"')) {
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
const repoRefWithoutScheme = lib.parseGitHubRepositoryReference("github.com/acme/robot-repo/tree/main/robots/arm");
if (
  !repoRefWithoutScheme ||
  repoRefWithoutScheme.owner !== "acme" ||
  repoRefWithoutScheme.repo !== "robot-repo" ||
  repoRefWithoutScheme.ref !== "main" ||
  repoRefWithoutScheme.path !== "robots/arm"
) {
  throw new Error("ilu GitHub repository parsing without scheme smoke test failed");
}
const repoRefFromSshRemote = lib.parseGitHubRepositoryReference("git@github.com:acme/robot-repo.git");
if (
  !repoRefFromSshRemote ||
  repoRefFromSshRemote.owner !== "acme" ||
  repoRefFromSshRemote.repo !== "robot-repo"
) {
  throw new Error("ilu GitHub SSH remote parsing smoke test failed");
}
const repoRefFromSshUrl = lib.parseGitHubRepositoryReference("ssh://git@github.com/acme/robot-repo.git");
if (
  !repoRefFromSshUrl ||
  repoRefFromSshUrl.owner !== "acme" ||
  repoRefFromSshUrl.repo !== "robot-repo"
) {
  throw new Error("ilu GitHub SSH URL parsing smoke test failed");
}
if (lib.parseGitHubRepositoryReference("https://gitlab.com/acme/robot-repo") !== null) {
  throw new Error("ilu non-GitHub repository parsing smoke test failed");
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
    accessToken: "token",
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

const gitHubMirrorFetchUrls = [];
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  gitHubMirrorFetchUrls.push(url);

  if (url === "https://api.github.com/repos/acme/public-robot/git/trees/main?recursive=1") {
    return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
      },
    });
  }

  if (url === "https://data.jsdelivr.com/v1/package/gh/acme/public-robot@main/flat") {
    return new Response(
      JSON.stringify({
        files: [{ name: "/robots/demo.urdf", size: 44 }],
      }),
      { status: 200 }
    );
  }

  if (url === "https://cdn.jsdelivr.net/gh/acme/public-robot@main/robots/demo.urdf") {
    return new Response('<robot name="mirror"><link name="base"/></robot>', {
      status: 200,
      headers: {
        "content-type": "application/xml",
      },
    });
  }

  throw new Error(`Unexpected GitHub public mirror smoke fetch: ${url}`);
};

try {
  const loadedGitHubUrdf = await loadSourceNode.loadSourceFromGitHub({
    reference: {
      owner: "acme",
      repo: "public-robot",
      ref: "main",
    },
    entryPath: "robots/demo.urdf",
  });
  if (
    loadedGitHubUrdf.entryFormat !== "urdf" ||
    !loadedGitHubUrdf.urdf.includes('robot name="mirror"')
  ) {
    throw new Error("ilu load-source GitHub public mirror fallback smoke test failed");
  }
  const treeFetchCount = gitHubMirrorFetchUrls.filter((url) => url.includes("/git/trees/")).length;
  const flatFetchCount = gitHubMirrorFetchUrls.filter((url) => url.includes("data.jsdelivr.com")).length;
  const mirrorFileFetchCount = gitHubMirrorFetchUrls.filter((url) => url.includes("cdn.jsdelivr.net")).length;
  if (treeFetchCount !== 1 || flatFetchCount !== 1 || mirrorFileFetchCount !== 1) {
    throw new Error("ilu load-source GitHub public mirror fallback fetch-count smoke test failed");
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

const meshCompressionResult = meshNode.compressMeshes({
  meshDir: path.join(tempRepo, "meshes"),
  maxFaces: 1,
  meshes: ["binary.stl"],
});
if (
  meshCompressionResult.overLimit !== 1 ||
  !meshCompressionResult.results[0]?.reason?.includes("Above target face limit")
) {
  throw new Error("ilu mesh compression smoke test failed");
}

const usdUrdfPath = path.join(tempRepo, "urdf", "usd_robot.urdf");
fs.writeFileSync(
  usdUrdfPath,
  "<robot name=\"usd_robot\">" +
    "<link name=\"base\"><visual><geometry><box size=\"1 2 3\"/></geometry></visual></link>" +
    "<link name=\"tool\"><visual><origin xyz=\"0 0 0\" rpy=\"0 0 0\"/><geometry><mesh filename=\"../meshes/binary.stl\" scale=\"1 1 1\"/></geometry></visual>" +
    "<collision><geometry><mesh filename=\"../meshes/binary.stl\" scale=\"1 1 1\"/></geometry></collision></link>" +
    "<joint name=\"hinge\" type=\"revolute\"><parent link=\"base\"/><child link=\"tool\"/><origin xyz=\"0 0 1\" rpy=\"0 0 0\"/><axis xyz=\"0 0 1\"/><limit lower=\"-1.57\" upper=\"1.57\"/></joint>" +
    "</robot>",
  "utf8"
);

const usdConversion = await urdfNode.convertURDFPathToUSD(usdUrdfPath, { rootPath: tempRepo });
if (
  !usdConversion.usdContent.includes('#usda 1.0') ||
  !usdConversion.usdContent.includes('def PhysicsRevoluteJoint "hinge"') ||
  !usdConversion.usdContent.includes('PhysicsCollisionAPI') ||
  !usdConversion.usdContent.includes('sourceMesh')
) {
  throw new Error("ilu URDF-to-USD smoke test failed");
}

const usdMeshAsset = urdfNode.convertMeshToUsd(binaryMeshPath, {
  outPath: path.join(tempRepo, "meshes", "binary.usda"),
});
if (
  !usdMeshAsset.wroteFile ||
  !fs.existsSync(usdMeshAsset.usdPath) ||
  !usdMeshAsset.usdContent?.includes('def Xform "MeshAsset"') ||
  !usdMeshAsset.usdContent?.includes('def Mesh "Mesh"')
) {
  throw new Error("ilu mesh-to-USD smoke test failed");
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

const cliHelpOutput = execFileSync(process.execPath, [cliPath, "help"], {
  cwd: root,
  encoding: "utf8",
});
if (
  !cliHelpOutput.includes("health-check") ||
  !cliHelpOutput.includes("morphology-card") ||
  !cliHelpOutput.includes("ilu  Open the interactive shell.") ||
  !cliHelpOutput.includes("ilu update") ||
  !cliHelpOutput.includes("ilu shell") ||
  !cliHelpOutput.includes("ilu completion bash") ||
  !cliHelpOutput.includes("--name-hints <a,b,c>") ||
  !cliHelpOutput.includes("snap-axes") ||
  !cliHelpOutput.includes("set-joint-type") ||
  !cliHelpOutput.includes("set-joint-limits") ||
  !cliHelpOutput.includes("set-joint-velocity") ||
  !cliHelpOutput.includes("canonicalize-joint-frame") ||
  !cliHelpOutput.includes("normalize-robot") ||
  !cliHelpOutput.includes("setup-xacro-runtime") ||
  !cliHelpOutput.includes("load-source") ||
  !cliHelpOutput.includes("--entry <repo-path>") ||
  !cliHelpOutput.includes("compress-meshes") ||
  !cliHelpOutput.includes("inspect-meshes") ||
  !cliHelpOutput.includes("urdf-to-usd")
) {
  throw new Error("ilu CLI surface smoke test failed");
}

const bashCompletionOutput = execFileSync(process.execPath, [cliPath, "completion", "bash"], {
  cwd: root,
  encoding: "utf8",
});
if (
  !bashCompletionOutput.includes("complete -o bashdefault -o default -F _ilu ilu") ||
  !bashCompletionOutput.includes("help update shell completion")
) {
  throw new Error("ilu bash completion smoke test failed");
}

const updateDryRunOutput = execFileSync(process.execPath, [cliPath, "update", "--dry-run"], {
  cwd: root,
  encoding: "utf8",
});
if (
  !updateDryRunOutput.includes("npm install -g --install-links=true") ||
  !updateDryRunOutput.includes("git+https://github.com/amtellezfernandez/i-love-urdf.git")
) {
  throw new Error("ilu update dry-run smoke test failed");
}

const shellHelpOutput = execFileSync(process.execPath, [cliPath, "help", "shell"], {
  cwd: root,
  encoding: "utf8",
});
if (
  !shellHelpOutput.includes("ilu shell") ||
  !shellHelpOutput.includes("owner/repo") ||
  !shellHelpOutput.includes("./robot.urdf") ||
  !shellHelpOutput.includes("/open") ||
  !shellHelpOutput.includes("/convert") ||
  !shellHelpOutput.includes("/update")
) {
  throw new Error("ilu shell help smoke test failed");
}

const shellDropDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-shell-drop-"));
const droppedUrdfPath = path.join(shellDropDir, "local robot.urdf");
fs.writeFileSync(droppedUrdfPath, "<robot name=\"drop_robot\"><link name=\"base\"/></robot>", "utf8");
const escapedDroppedUrdfPath = droppedUrdfPath.replaceAll(" ", "\\ ");
const multiCandidateDir = path.join(shellDropDir, "multi-candidate");
fs.mkdirSync(path.join(multiCandidateDir, "robots"), { recursive: true });
fs.writeFileSync(
  path.join(multiCandidateDir, "robots", "a.urdf"),
  "<robot name=\"alpha_robot\"><link name=\"base\"/></robot>",
  "utf8"
);
fs.writeFileSync(
  path.join(multiCandidateDir, "robots", "b.urdf"),
  "<robot name=\"beta_robot\"><link name=\"base\"/></robot>",
  "utf8"
);
const escapedMultiCandidateDir = multiCandidateDir.replaceAll(" ", "\\ ");
const droppedZipPath = path.join(shellDropDir, "robot bundle.zip");
const droppedZip = new AdmZip();
droppedZip.addLocalFile(droppedUrdfPath, "robot_bundle/urdf", "robot.urdf");
droppedZip.writeZip(droppedZipPath);
const escapedDroppedZipPath = droppedZipPath.replaceAll(" ", "\\ ");

const shellTranscript = execFileSync(process.execPath, [cliPath, "shell"], {
  cwd: root,
  encoding: "utf8",
  input: "ANYbotics/anymal_b_simple_description\n/exit\n",
});
if (
  !shellTranscript.includes("interactive urdf shell") ||
  !shellTranscript.includes("paste owner/repo or drop a local folder/file") ||
  !shellTranscript.includes("ANYbotics/anymal_b_simple_description") ||
  !shellTranscript.includes("validation and health check passed") ||
  !shellTranscript.includes("loaded") ||
  !shellTranscript.includes("loaded urdf/anymal.urdf") ||
  !shellTranscript.includes("validation passed") ||
  !shellTranscript.includes("health check passed")
) {
  throw new Error("ilu shell direct-repo entry smoke test failed");
}

const localDropTranscript = execFileSync(process.execPath, [cliPath, "shell"], {
  cwd: root,
  encoding: "utf8",
  input: `${escapedDroppedUrdfPath}\n/exit\n`,
});
if (
  !localDropTranscript.includes("validation and health check passed") ||
  !localDropTranscript.includes(droppedUrdfPath) ||
  !localDropTranscript.includes("validation passed") ||
  !localDropTranscript.includes("health check passed")
) {
  throw new Error("ilu shell local-urdf entry smoke test failed");
}

const zipDropTranscript = execFileSync(process.execPath, [cliPath, "shell"], {
  cwd: root,
  encoding: "utf8",
  input: `${escapedDroppedZipPath}\n/exit\n`,
});
if (
  !zipDropTranscript.includes("validation and health check passed") ||
  !zipDropTranscript.includes("opened archive") ||
  !zipDropTranscript.includes(droppedZipPath) ||
  !zipDropTranscript.includes("loaded urdf/robot.urdf")
) {
  throw new Error("ilu shell zip-drop smoke test failed");
}

const checkTaskTranscript = execFileSync(process.execPath, [cliPath, "shell"], {
  cwd: root,
  encoding: "utf8",
  input: `/check\n${escapedDroppedUrdfPath}\n/exit\n`,
});
if (
  !checkTaskTranscript.includes("/check") ||
  !checkTaskTranscript.includes("checks") ||
  !checkTaskTranscript.includes("validation passed") ||
  !checkTaskTranscript.includes("health check passed") ||
  !checkTaskTranscript.includes(droppedUrdfPath)
) {
  throw new Error("ilu shell direct-check input smoke test failed");
}

const multiCandidateTranscript = execFileSync(process.execPath, [cliPath, "shell"], {
  cwd: root,
  encoding: "utf8",
  input: `/open\n/local\n${escapedMultiCandidateDir}\n2\n/exit\n`,
});
if (
  !multiCandidateTranscript.includes("choose a candidate") ||
  !multiCandidateTranscript.includes("press Enter for the highlighted match") ||
  !multiCandidateTranscript.includes("loaded robots/b.urdf") ||
  !multiCandidateTranscript.includes("selected robots/b.urdf from 2 candidates")
) {
  throw new Error("ilu shell multi-candidate picker smoke test failed");
}

const xacroShellTranscript = execFileSync(process.execPath, [cliPath, "shell"], {
  cwd: root,
  encoding: "utf8",
  input: "/convert\n/xacro\n/exit\n",
});
if (
  !xacroShellTranscript.includes("/convert") ||
  !xacroShellTranscript.includes("/mjcf") ||
  !xacroShellTranscript.includes("/usd") ||
  !xacroShellTranscript.includes("XACRO file path")
) {
  throw new Error("ilu shell xacro workflow guidance smoke test failed");
}

let invalidCommandOutput = "";
try {
  execFileSync(process.execPath, [cliPath, "not-a-command"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  invalidCommandOutput = `${String(error.stdout || "")}${String(error.stderr || "")}`;
}
if (!invalidCommandOutput.includes("Unknown command: not-a-command")) {
  throw new Error("ilu CLI unknown-command smoke test failed");
}

console.log("ilu smoke test passed.");

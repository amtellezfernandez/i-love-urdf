#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

execFileSync("npm", ["run", "build"], { stdio: "inherit", cwd: root, shell: true });

const lib = await import(path.join(root, "dist", "index.js"));
const localLib = await import(path.join(root, "dist", "repository", "localRepositoryInspection.js"));

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;

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
  "<mesh filename=\"assets/sts3215_03a_v1.stl\" scale=\"1 1 1\"/></geometry>" +
  "<material name=\"sts3215\"/></visual></link>" +
  "<link name=\"arm_link_2\"><visual><origin xyz=\"1 0 0\" rpy=\"0 0 0\"/><geometry>" +
  "<mesh filename=\"assets/sts3215_03a_v1.stl\" scale=\"1 1 1\"/></geometry>" +
  "<material name=\"sts3215\"/></visual></link></robot>";

const validate = lib.validateUrdf(urdf);
if (!validate.isValid) {
  throw new Error("i-love-urdf validate smoke test failed");
}

const transmissionValidate = lib.validateUrdf(transmissionUrdf);
if (!transmissionValidate.isValid) {
  throw new Error("i-love-urdf transmission-aware validate smoke test failed");
}

const axes = lib.normalizeJointAxes(urdf);
if (!axes.urdfContent.includes("0.7071067812")) {
  throw new Error("i-love-urdf normalize-axes smoke test failed");
}

const meshes = lib.fixMeshPaths(urdf);
if (!meshes.urdfContent.includes("package://smoke_robot_description")) {
  throw new Error("i-love-urdf fix-mesh-paths smoke test failed");
}

const renamedJoint = lib.renameJointInUrdf(urdf, "j", "hinge_joint");
if (!renamedJoint.success || !renamedJoint.content.includes('joint name="hinge_joint"')) {
  throw new Error("i-love-urdf rename-joint library smoke test failed");
}

const renamedTransmissionJoint = lib.renameJointInUrdf(transmissionUrdf, "j", "hinge_joint");
if (
  !renamedTransmissionJoint.success ||
  !renamedTransmissionJoint.content.includes('joint name="hinge_joint" type="revolute"') ||
  !renamedTransmissionJoint.content.includes('<transmission name="j_trans">') ||
  !renamedTransmissionJoint.content.includes('<joint name="hinge_joint">')
) {
  throw new Error("i-love-urdf transmission-aware rename-joint smoke test failed");
}

const renamedLink = lib.renameLinkInUrdf(urdf, "tip", "tool0");
if (!renamedLink.success || !renamedLink.content.includes('child link="tool0"')) {
  throw new Error("i-love-urdf rename-link library smoke test failed");
}

const removedTransmissionJoint = lib.removeJointsFromUrdf(transmissionUrdf, ["j"]);
if (
  !removedTransmissionJoint.success ||
  removedTransmissionJoint.content.includes('joint name="j" type="revolute"') ||
  removedTransmissionJoint.content.includes('<transmission name="j_trans">')
) {
  throw new Error("i-love-urdf transmission-aware remove-joints smoke test failed");
}

const analysis = lib.analyzeUrdf(urdf);
if (analysis.robotName !== "smoke_robot" || analysis.linkNames.length !== 3) {
  throw new Error("i-love-urdf analyze smoke test failed");
}

const diff = lib.compareUrdfs(urdf, renamedJoint.content);
if (diff.areEqual || diff.differenceCount < 1) {
  throw new Error("i-love-urdf diff smoke test failed");
}

const meshAssets = lib.updateMeshPathsToAssetsInUrdf(urdf);
if (!meshAssets.success || !meshAssets.content.includes('mesh filename="assets/abs/path/mesh.stl"')) {
  throw new Error("i-love-urdf mesh-to-assets smoke test failed");
}

const mjcf = lib.convertURDFToMJCF(urdf);
if (!mjcf.mjcfContent.includes("<mujoco")) {
  throw new Error("i-love-urdf urdf-to-mjcf smoke test failed");
}

const xacro = lib.convertURDFToXacro(xacroRegressionUrdf);
if (!xacro.xacroContent.includes("xacro:property")) {
  throw new Error("i-love-urdf urdf-to-xacro smoke test failed");
}
if (!xacro.xacroContent.includes('robot name="so101_robot"')) {
  throw new Error("i-love-urdf urdf-to-xacro robot name regression smoke test failed");
}
if (!xacro.xacroContent.includes('mesh filename="assets/sts3215_03a_v1.stl"')) {
  throw new Error("i-love-urdf urdf-to-xacro mesh filename regression smoke test failed");
}
if (!xacro.xacroContent.includes('material name="sts3215"')) {
  throw new Error("i-love-urdf urdf-to-xacro material name regression smoke test failed");
}
if (xacro.xacroContent.includes('name="so${') || xacro.xacroContent.includes('filename="assets/${')) {
  throw new Error("i-love-urdf urdf-to-xacro unsafe substitution regression smoke test failed");
}

const repoRef = lib.parseGitHubRepositoryReference("https://github.com/acme/robot-repo/tree/main/robots/arm");
if (!repoRef || repoRef.owner !== "acme" || repoRef.repo !== "robot-repo" || repoRef.ref !== "main" || repoRef.path !== "robots/arm") {
  throw new Error("i-love-urdf GitHub repository parsing smoke test failed");
}

const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "i-love-urdf-smoke-"));
fs.mkdirSync(path.join(tempRepo, "meshes"), { recursive: true });
fs.writeFileSync(path.join(tempRepo, "robot.urdf"), urdf, "utf8");
fs.writeFileSync(path.join(tempRepo, "._robot.urdf"), "not a urdf", "utf8");
fs.writeFileSync(path.join(tempRepo, "meshes", "mesh.stl"), "solid mesh\nendsolid mesh\n", "utf8");
const localSummary = await localLib.inspectLocalRepositoryUrdfs({ path: tempRepo });
if (
  localSummary.candidateCount !== 1 ||
  localSummary.primaryCandidatePath !== "robot.urdf"
) {
  throw new Error("i-love-urdf local repository inspection smoke test failed");
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
  throw new Error("i-love-urdf repo mesh repair library smoke test failed");
}

const repairedLocal = await localLib.repairLocalRepositoryMeshReferences(
  { path: tempRepo },
  { urdfPath: "urdf/robot.urdf" }
);
if (!repairedLocal.success || repairedLocal.corrections.length !== 1) {
  throw new Error("i-love-urdf local mesh repair smoke test failed");
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
  throw new Error("i-love-urdf wrong-path mesh repair smoke test failed");
}

console.log("i-love-urdf smoke test passed.");

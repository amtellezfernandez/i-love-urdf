#!/usr/bin/env node

import path from "node:path";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

execFileSync("npm", ["run", "build"], { stdio: "inherit", cwd: root, shell: true });

const lib = await import(path.join(root, "dist", "index.js"));

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;

const urdf =
  "<robot name=\"smoke_robot\"><link name=\"base\"/><link name=\"tip\"/>" +
  "<joint name=\"j\" type=\"revolute\"><parent link=\"base\"/><child link=\"tip\"/>" +
  "<axis xyz=\"1 1 0\"/></joint><link name=\"mesh_link\"><visual><geometry>" +
  "<mesh filename=\"/abs/path/mesh.stl\"/></geometry></visual></link></robot>";

const validate = lib.validateUrdf(urdf);
if (!validate.isValid) {
  throw new Error("i-love-urdf validate smoke test failed");
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

const renamedLink = lib.renameLinkInUrdf(urdf, "tip", "tool0");
if (!renamedLink.success || !renamedLink.content.includes('child link="tool0"')) {
  throw new Error("i-love-urdf rename-link library smoke test failed");
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

console.log("i-love-urdf smoke test passed.");

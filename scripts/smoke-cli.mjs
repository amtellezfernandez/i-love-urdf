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

console.log("i-love-urdf smoke test passed.");

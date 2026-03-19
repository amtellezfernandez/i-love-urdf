#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installDomGlobals } from "./install-dom-globals.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

const browserExport = packageJson.exports?.["./browser"];
if (!browserExport || !browserExport.import || !browserExport.require) {
  throw new Error('package.json must expose "./browser" with both import and require targets.');
}

const expectedExports = [
  "parseURDF",
  "serializeURDF",
  "parseLinkData",
  "parseLinkDataFromDocument",
  "parseSensors",
  "parseSensorsFromDocument",
  "parseJointAxesFromDocument",
  "parseJointAxesFromURDF",
  "parseJointLimitsFromDocument",
  "parseJointLimitsFromURDF",
  "getJointLimits",
  "parseJointHierarchyFromDocument",
  "parseJointHierarchy",
  "parseLinkNamesFromDocument",
  "parseLinkNames",
  "getJointLinks",
  "findNamedUrdfElement",
  "hasXacroSyntax",
  "parsePlainUrdfDocument",
  "canonicalOrderURDF",
  "compareUrdfs",
  "normalizeJointAxes",
  "snapJointAxes",
  "prettyPrintURDF",
  "buildOrientationMappingRotation",
  "applyOrientationToRobot",
  "rotateRobot90Degrees",
  "isSafeMeshPath",
  "normalizeMeshPath",
  "parseMeshReference",
  "normalizeMeshPathForMatch",
  "fixMeshPaths",
  "inspectRepositoryCandidates",
  "collectPackageResourceFilesForMatchedFiles",
  "resolveRepositoryXacroTargetPath",
  "buildRepositoryFileEntriesFromPaths",
  "buildPackageRootsFromRepositoryFiles",
  "extractPackageNameFromPackageXml",
  "resolveRepositoryFileReference",
  "resolveRepositoryMeshReferences",
];

const resolveExportPath = (relativePath) => path.join(root, relativePath.replace(/^\.\//, ""));

const importPath = resolveExportPath(browserExport.import);
const requirePath = resolveExportPath(browserExport.require);
if (!fs.existsSync(importPath) || !fs.existsSync(requirePath)) {
  execFileSync(process.execPath, [path.join(root, "scripts", "build-package.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
}

const imported = await import(pathToFileURL(importPath).href);
const required = createRequire(import.meta.url)(requirePath);

for (const exportName of expectedExports) {
  if (typeof imported[exportName] === "undefined") {
    throw new Error(`Missing ESM browser export: ${exportName}`);
  }
  if (typeof required[exportName] === "undefined") {
    throw new Error(`Missing CommonJS browser export: ${exportName}`);
  }
}

installDomGlobals();

const sampleUrdf =
  '<robot name="browser_entry"><link name="base"/><link name="tip"/>' +
  '<joint name="fixed_joint" type="fixed"><parent link="base"/><child link="tip"/></joint></robot>';

const parsed = imported.parseURDF(sampleUrdf);
if (!parsed.isValid) {
  throw new Error("Browser entry parseURDF failed its smoke assertion.");
}
if (!imported.prettyPrintURDF(sampleUrdf).includes('<robot name="browser_entry">')) {
  throw new Error("Browser entry prettyPrintURDF failed its smoke assertion.");
}
if (required.normalizeMeshPathForMatch("meshes\\part.stl") !== "meshes/part.stl") {
  throw new Error("Browser entry mesh-path normalization failed its smoke assertion.");
}
if (!imported.hasXacroSyntax('<robot xmlns:xacro="http://ros.org/wiki/xacro"></robot>')) {
  throw new Error("Browser entry xacro-syntax detection failed its smoke assertion.");
}
const safeParsed = imported.parsePlainUrdfDocument(sampleUrdf, {
  maxBytes: 1024,
  maxDepth: 8,
  rejectXacro: true,
});
if (!safeParsed.success || !safeParsed.document) {
  throw new Error("Browser entry safe plain-URDF parsing failed its smoke assertion.");
}
if (!imported.findNamedUrdfElement(safeParsed.document, "joint", "fixed_joint")) {
  throw new Error("Browser entry named-element lookup failed its smoke assertion.");
}
const resolvedXacroTarget = imported.resolveRepositoryXacroTargetPath(
  [{ path: "ur_description/urdf/ur10.urdf.xacro", type: "file" }],
  "ur_description/urdf/ur10.xacro"
);
if (resolvedXacroTarget !== "ur_description/urdf/ur10.urdf.xacro") {
  throw new Error("Browser entry xacro target resolution failed its smoke assertion.");
}

console.log("ilu browser entry check passed.");

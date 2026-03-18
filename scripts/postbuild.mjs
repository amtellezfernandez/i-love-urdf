#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = path.join(root, "src", "xacro", "xacro_expand_runtime.py");
const destinationDir = path.join(root, "dist", "xacro");
const destination = path.join(destinationDir, "xacro_expand_runtime.py");
const browserEntryPath = path.join(root, "dist", "browser.mjs");

const browserExports = [
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

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);
fs.writeFileSync(
  browserEntryPath,
  [
    'import browserLib from "./browser.js";',
    "",
    ...browserExports.map((name) => `export const ${name} = browserLib.${name};`),
    "",
  ].join("\n"),
  "utf8"
);

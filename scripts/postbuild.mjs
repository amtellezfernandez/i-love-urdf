#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const destinationDir = path.join(root, "dist", "xacro");
const browserEntryPath = path.join(root, "dist", "browser.mjs");
const copiedXacroAssets = ["xacro_expand_runtime.py", "xacroContract.runtime.cjs"];

const browserExports = [
  "parseURDF",
  "serializeURDF",
  "analyzeUrdf",
  "analyzeUrdfDocument",
  "analyzeRobotMorphology",
  "buildRobotStructureLabels",
  "buildRobotMorphologyCard",
  "buildRobotOrientationCard",
  "identifyRobotType",
  "checkPhysicsHealth",
  "getJointTypeDegreesOfFreedom",
  "getRobotMorphologyDisplayTags",
  "guessOrientation",
  "guessUrdfOrientation",
  "parseUrdfStats",
  "isControllableJointType",
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
  "parseUrdfDocument",
  "getUrdfElementByName",
  "serializeUrdfDocument",
  "canonicalOrderURDF",
  "compareUrdfs",
  "normalizeJointAxis",
  "normalizeJointAxes",
  "snapJointAxes",
  "prettyPrintURDF",
  "sanitizeNames",
  "sanitizeUrdfName",
  "alignJointToLocalZ",
  "canonicalizeJointFrames",
  "convertURDFToUSD",
  "createInlineUsdMeshPrim",
  "createUsdStage",
  "mapUrdfToUsdPrim",
  "buildOrientationMappingRotation",
  "applyGlobalRotation",
  "applyOrientationToRobot",
  "rotateRobot90Degrees",
  "rotateInertiaTensor",
  "fixInertiaThresholds",
  "isSafeMeshPath",
  "normalizeMeshPath",
  "parseMeshReference",
  "computeMeshBoundsFromArrayBuffer",
  "resolveMeshCandidates",
  "buildPackageRootsFromMeshBlobMap",
  "resolveMeshBlob",
  "resolveMeshBlobFromReference",
  "resolveMeshResourceBlob",
  "stripMeshSchemes",
  "resolvePackagePaths",
  "normalizeMeshPathForMatch",
  "fixMeshPaths",
  "fixMissingMeshReferences",
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
for (const assetName of copiedXacroAssets) {
  fs.copyFileSync(path.join(root, "src", "xacro", assetName), path.join(destinationDir, assetName));
}
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

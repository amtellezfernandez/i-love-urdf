#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getBrowserRuntimeExports } from "./browser-exports.mjs";
import { installDomGlobals } from "./install-dom-globals.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

const browserExport = packageJson.exports?.["./browser"];
if (!browserExport || !browserExport.import || !browserExport.require) {
  throw new Error('package.json must expose "./browser" with both import and require targets.');
}

const expectedExports = getBrowserRuntimeExports(root);

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
if (required.sanitizeNames("Should Be.Strict-Name") !== "should_be_strict_name") {
  throw new Error("Browser entry sanitizeNames failed its smoke assertion.");
}
const normalizedJointAxis = imported.normalizeJointAxis("0.01 0.98 0");
if (
  Math.abs(normalizedJointAxis[0]) > 0.02 ||
  Math.abs(normalizedJointAxis[1] - 1) > 0.001 ||
  Math.abs(normalizedJointAxis[2]) > 0.02
) {
  throw new Error("Browser entry normalizeJointAxis failed its smoke assertion.");
}
const sampleAsciiStl = new TextEncoder().encode(
  [
    "solid sample",
    "facet normal 0 0 1",
    "outer loop",
    "vertex 0 0 0",
    "vertex 1 0 0",
    "vertex 0 2 3",
    "endloop",
    "endfacet",
    "endsolid sample",
    "",
  ].join("\n")
).buffer;
const sampleBounds = imported.computeMeshBoundsFromArrayBuffer(sampleAsciiStl, "1 1 1");
if (!sampleBounds || sampleBounds.max[2] !== 3 || sampleBounds.size[1] !== 2) {
  throw new Error("Browser entry mesh-bounds parsing failed its smoke assertion.");
}
const meshBlobMap = {
  "pkg_a/meshes/link.stl": new Blob(["a"]),
  "pkg_b/meshes/other.stl": new Blob(["b"]),
};
const resolvedMesh = imported.resolveMeshBlobFromReference(
  "package://pkg_a/meshes/link.stl",
  meshBlobMap,
  "pkg_a/urdf",
  { pkg_a: ["pkg_a"] }
);
if (
  !resolvedMesh ||
  resolvedMesh.path !== "pkg_a/meshes/link.stl" ||
  imported.stripMeshSchemes("package://pkg_a/meshes/link.stl") !== "meshes/link.stl"
) {
  throw new Error("Browser entry mesh-resolution failed its smoke assertion.");
}
const candidateMatches = imported.resolveMeshCandidates({
  ref: "package://pkg_a/meshes/link.obj",
  meshFiles: meshBlobMap,
  urdfBasePath: "pkg_a/urdf",
  packageRoots: { pkg_a: ["pkg_a"] },
});
if (candidateMatches.length !== 1 || candidateMatches[0]?.resolvedPath !== "pkg_a/meshes/link.stl") {
  throw new Error("Browser entry mesh-candidate resolution failed its smoke assertion.");
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
const parsedDocument = imported.parseUrdfDocument(sampleUrdf);
if (
  !parsedDocument ||
  imported.getUrdfElementByName(parsedDocument, "joint", "fixed_joint")?.getAttribute("type") !== "fixed" ||
  !imported.serializeUrdfDocument(parsedDocument).includes('robot name="browser_entry"')
) {
  throw new Error("Browser entry URDF document helpers failed their smoke assertion.");
}
const resolvedXacroTarget = imported.resolveRepositoryXacroTargetPath(
  [{ path: "ur_description/urdf/ur10.urdf.xacro", type: "file" }],
  "ur_description/urdf/ur10.xacro"
);
if (resolvedXacroTarget !== "ur_description/urdf/ur10.urdf.xacro") {
  throw new Error("Browser entry xacro target resolution failed its smoke assertion.");
}
const repairedMeshReferences = imported.fixMissingMeshReferences(
  '<robot name="repair"><link name="base"><visual><geometry><mesh filename="mesh.stl"/></geometry></visual></link></robot>',
  { "meshes/mesh.stl": new Blob(["solid mesh\nendsolid mesh\n"]) },
  { basePath: "urdf" }
);
if (
  !repairedMeshReferences.success ||
  repairedMeshReferences.corrections[0]?.corrected !== "../meshes/mesh.stl"
) {
  throw new Error("Browser entry missing-mesh repair failed its smoke assertion.");
}
const usdConversion = imported.convertURDFToUSD(
  '<robot name="usd_browser"><link name="base"><visual><geometry><box size="1 2 3"/></geometry></visual></link></robot>'
);
if (
  !usdConversion.usdContent.includes('#usda 1.0') ||
  !usdConversion.usdContent.includes('def Xform "World"') ||
  !usdConversion.usdContent.includes('def Xform "usd_browser"')
) {
  throw new Error("Browser entry URDF-to-USD conversion failed its smoke assertion.");
}

console.log("ilu browser entry check passed.");

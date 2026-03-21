import * as fs from "node:fs";
import * as path from "node:path";
import { convertURDFToMJCF, convertURDFToXacro } from "../index";
import { DEFAULT_MESH_COMPRESSION_MAX_FACES } from "../mesh/meshPrep";
import { parseMeshReference } from "../mesh/meshPaths";
import { parseXml } from "../xmlDom";
import { emitWrittenPayload, type EditCommandHandler } from "./editCommandRuntime";

const inspectLocalMeshFaceBudgetWarnings = (urdfPath: string, urdfContent: string): string[] => {
  const doc = parseXml(urdfContent);
  const urdfDir = path.dirname(path.resolve(urdfPath));
  const riskyMeshes = new Map<string, { meshPath: string; faceCount: number; meshDir: string }>();

  for (const meshElement of Array.from(doc.querySelectorAll("mesh"))) {
    const rawRef = meshElement.getAttribute("filename");
    if (!rawRef) continue;

    const parsedRef = parseMeshReference(rawRef);
    const refPath = parsedRef.path || parsedRef.raw;
    if (!refPath.toLowerCase().endsWith(".stl")) continue;

    let absoluteMeshPath = "";
    if (parsedRef.scheme === "file" && parsedRef.isAbsoluteFile) {
      absoluteMeshPath = parsedRef.path;
    } else if (parsedRef.scheme === null || (parsedRef.scheme === "file" && !parsedRef.isAbsoluteFile)) {
      absoluteMeshPath = path.resolve(urdfDir, refPath);
    } else {
      continue;
    }

    if (!fs.existsSync(absoluteMeshPath) || !fs.statSync(absoluteMeshPath).isFile()) {
      continue;
    }

    const buffer = fs.readFileSync(absoluteMeshPath);
    if (buffer.length < 84) continue;

    const faceCount = buffer.readUInt32LE(80);
    if (faceCount <= DEFAULT_MESH_COMPRESSION_MAX_FACES) continue;

    riskyMeshes.set(absoluteMeshPath, {
      meshPath: absoluteMeshPath,
      faceCount,
      meshDir: path.dirname(absoluteMeshPath),
    });
  }

  if (riskyMeshes.size === 0) {
    return [];
  }

  const riskyMeshList = Array.from(riskyMeshes.values());
  const meshDirs = Array.from(new Set(riskyMeshList.map((mesh) => mesh.meshDir)));
  const commandHint =
    meshDirs.length === 1
      ? ` Inspect: ilu inspect-meshes --mesh-dir ${meshDirs[0]}. Fix: ilu compress-meshes --mesh-dir ${meshDirs[0]} --in-place`
      : " Inspect those mesh directories with inspect-meshes, then run compress-meshes on the ones that contain the failing STL files.";
  const meshSummary = riskyMeshList
    .slice(0, 3)
    .map((mesh) => `${path.basename(mesh.meshPath)} (${mesh.faceCount} faces)`)
    .join(", ");

  return [
    `Detected ${riskyMeshList.length} STL mesh${riskyMeshList.length === 1 ? "" : "es"} above the current face budget of ${DEFAULT_MESH_COMPRESSION_MAX_FACES}. Downstream import may fail or require simplification: ${meshSummary}.${commandHint}`,
  ];
};

export const EDIT_CONVERSION_COMMAND_HANDLERS = {
  "urdf-to-mjcf": ({ helpers, urdfPath, urdfContent, outPath }) => {
    const result = convertURDFToMJCF(urdfContent);
    result.warnings.push(...inspectLocalMeshFaceBudgetWarnings(urdfPath, urdfContent));
    emitWrittenPayload(helpers, outPath, result.mjcfContent, result);
  },

  "urdf-to-xacro": ({ helpers, urdfContent, outPath }) => {
    const result = convertURDFToXacro(urdfContent);
    emitWrittenPayload(helpers, outPath, result.xacroContent, result);
  },
} satisfies Record<"urdf-to-mjcf" | "urdf-to-xacro", EditCommandHandler>;

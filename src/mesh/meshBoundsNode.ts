import * as fs from "node:fs";
import { extractExtension } from "./meshFormats";
import { readStlBounds, type StlBounds } from "./stlBinary";
import { parseNodeXmlDocument } from "../node/nodeDomRuntime";

export interface MeshFileBounds {
  min: [number, number, number];
  max: [number, number, number];
  vertexCount: number;
  format: "stl" | "obj" | "dae";
}

const emptyBounds = (format: MeshFileBounds["format"]): MeshFileBounds => ({
  min: [0, 0, 0],
  max: [0, 0, 0],
  vertexCount: 0,
  format,
});

const updateBounds = (
  current: MeshFileBounds,
  x: number,
  y: number,
  z: number
) => {
  if (current.vertexCount === 0) {
    current.min = [x, y, z];
    current.max = [x, y, z];
    current.vertexCount = 1;
    return;
  }
  current.min = [
    Math.min(current.min[0], x),
    Math.min(current.min[1], y),
    Math.min(current.min[2], z),
  ];
  current.max = [
    Math.max(current.max[0], x),
    Math.max(current.max[1], y),
    Math.max(current.max[2], z),
  ];
  current.vertexCount += 1;
};

export function readObjBounds(filePath: string): MeshFileBounds {
  const content = fs.readFileSync(filePath, "utf8");
  const bounds = emptyBounds("obj");

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("v ")) {
      return;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) {
      return;
    }
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return;
    }
    updateBounds(bounds, x, y, z);
  });

  if (bounds.vertexCount === 0) {
    throw new Error(`Unsupported OBJ format for ${filePath}. No vertex records were found.`);
  }

  return bounds;
}

const parseFloatArrayValues = (text: string): number[] =>
  text
    .trim()
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

const getAccessorStride = (source: Element): number => {
  const accessor = source.querySelector("technique_common accessor");
  const stride = Number(accessor?.getAttribute("stride") || "3");
  return Number.isFinite(stride) && stride >= 3 ? stride : 3;
};

export function readDaeBounds(filePath: string): MeshFileBounds {
  const content = fs.readFileSync(filePath, "utf8");
  const document = parseNodeXmlDocument(content, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Invalid DAE XML in ${filePath}.`);
  }

  const bounds = emptyBounds("dae");
  const sources = Array.from(document.querySelectorAll("source")) as Element[];
  const preferred = sources.filter((source) =>
    /position/i.test(source.getAttribute("id") || "") ||
    /position/i.test(source.getAttribute("name") || "")
  );
  const candidates = preferred.length > 0 ? preferred : sources;

  candidates.forEach((source) => {
    const floatArray = source.querySelector("float_array");
    if (!floatArray) {
      return;
    }
    const values = parseFloatArrayValues(floatArray.textContent || "");
    const stride = getAccessorStride(source);
    for (let index = 0; index + 2 < values.length; index += stride) {
      updateBounds(bounds, values[index], values[index + 1], values[index + 2]);
    }
  });

  if (bounds.vertexCount === 0) {
    throw new Error(`Unsupported DAE format for ${filePath}. No position sources were found.`);
  }

  return bounds;
}

export function readMeshBounds(filePath: string): MeshFileBounds {
  const extension = extractExtension(filePath)?.toLowerCase();
  if (extension === ".stl") {
    const bounds: StlBounds = readStlBounds(filePath);
    return {
      min: bounds.min,
      max: bounds.max,
      vertexCount: bounds.vertexCount,
      format: "stl",
    };
  }
  if (extension === ".obj") {
    return readObjBounds(filePath);
  }
  if (extension === ".dae") {
    return readDaeBounds(filePath);
  }
  throw new Error(`Unsupported mesh format for bounds: ${filePath}`);
}

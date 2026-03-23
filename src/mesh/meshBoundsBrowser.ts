import type { MeshBounds } from "./collisionAutoFit";

const STL_HEADER_BYTES = 80;
const STL_COUNT_OFFSET = STL_HEADER_BYTES;
const STL_RECORD_BYTES = 50;
const ASCII_VERTEX_PATTERN =
  /vertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;

type ScaleVec3 = [number, number, number];

const parseScale = (scale: string): ScaleVec3 => {
  const values = scale
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((value) => Number(value));
  return [
    Number.isFinite(values[0]) ? values[0] : 1,
    Number.isFinite(values[1]) ? values[1] : 1,
    Number.isFinite(values[2]) ? values[2] : 1,
  ];
};

const buildMeshBounds = (vertices: Float32Array): MeshBounds | null => {
  if (vertices.length < 3) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < vertices.length; index += 3) {
    const x = vertices[index];
    const y = vertices[index + 1];
    const z = vertices[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    vertices,
  };
};

const isBinaryStlArrayBuffer = (arrayBuffer: ArrayBuffer): boolean => {
  if (arrayBuffer.byteLength < STL_HEADER_BYTES + 4) {
    return false;
  }
  const view = new DataView(arrayBuffer);
  const faceCount = view.getUint32(STL_COUNT_OFFSET, true);
  return STL_HEADER_BYTES + 4 + faceCount * STL_RECORD_BYTES === arrayBuffer.byteLength;
};

const computeBinaryStlBoundsFromArrayBuffer = (
  arrayBuffer: ArrayBuffer,
  scale: ScaleVec3
): MeshBounds | null => {
  if (!isBinaryStlArrayBuffer(arrayBuffer)) {
    return null;
  }

  const view = new DataView(arrayBuffer);
  const faceCount = view.getUint32(STL_COUNT_OFFSET, true);
  const vertices = new Float32Array(faceCount * 9);
  let writeIndex = 0;
  let offset = STL_HEADER_BYTES + 4;

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    offset += 12;
    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      vertices[writeIndex] = view.getFloat32(offset, true) * scale[0];
      vertices[writeIndex + 1] = view.getFloat32(offset + 4, true) * scale[1];
      vertices[writeIndex + 2] = view.getFloat32(offset + 8, true) * scale[2];
      writeIndex += 3;
      offset += 12;
    }
    offset += 2;
  }

  return buildMeshBounds(vertices);
};

const computeAsciiStlBoundsFromArrayBuffer = (
  arrayBuffer: ArrayBuffer,
  scale: ScaleVec3
): MeshBounds | null => {
  const text = new TextDecoder("utf-8").decode(arrayBuffer);
  const values: number[] = [];

  for (const match of text.matchAll(ASCII_VERTEX_PATTERN)) {
    const x = Number(match[1]) * scale[0];
    const y = Number(match[2]) * scale[1];
    const z = Number(match[3]) * scale[2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    values.push(x, y, z);
  }

  if (values.length === 0) {
    return null;
  }

  return buildMeshBounds(new Float32Array(values));
};

export function computeMeshBoundsFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  scale: string = "1 1 1"
): MeshBounds | null {
  const scaleVec = parseScale(scale);
  return (
    computeBinaryStlBoundsFromArrayBuffer(arrayBuffer, scaleVec) ??
    computeAsciiStlBoundsFromArrayBuffer(arrayBuffer, scaleVec)
  );
}

import * as fs from "node:fs";

const STL_HEADER_BYTES = 80;
const STL_COUNT_OFFSET = STL_HEADER_BYTES;
const STL_RECORD_BYTES = 50;
const STL_MIN_EDGE = 1e-6;

export interface BinaryStlMetadata {
  faceCount: number;
  byteLength: number;
  isBinary: boolean;
}

export interface BinaryStlMesh extends BinaryStlMetadata {
  header: Buffer;
  triangles: Float32Array;
}

export interface TriangleBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface StlBounds extends TriangleBounds {
  isBinary: boolean;
  vertexCount: number;
}

export interface StlTriangleMesh extends StlBounds {
  triangles: Float32Array;
}

export interface SimplifiedBinaryStl {
  divisions: number;
  faceCount: number;
  triangles: Float32Array;
}

const clipIndex = (value: number, divisions: number): number => {
  if (value < 0) return 0;
  if (value >= divisions) return divisions - 1;
  return value;
};

const squaredDistance = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number => {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
};

export function inspectBinaryStlBuffer(buffer: Buffer): BinaryStlMetadata {
  if (buffer.length < STL_HEADER_BYTES + 4) {
    return { faceCount: 0, byteLength: buffer.length, isBinary: false };
  }

  const faceCount = buffer.readUInt32LE(STL_COUNT_OFFSET);
  const expectedLength = STL_HEADER_BYTES + 4 + faceCount * STL_RECORD_BYTES;
  return {
    faceCount,
    byteLength: buffer.length,
    isBinary: expectedLength === buffer.length,
  };
}

export function inspectBinaryStlFile(filePath: string): BinaryStlMetadata {
  return inspectBinaryStlBuffer(fs.readFileSync(filePath));
}

export function readBinaryStl(filePath: string): BinaryStlMesh {
  const buffer = fs.readFileSync(filePath);
  const metadata = inspectBinaryStlBuffer(buffer);
  if (!metadata.isBinary) {
    throw new Error(`Unsupported STL format for ${filePath}. Expected a valid binary STL.`);
  }

  const triangles = new Float32Array(metadata.faceCount * 9);
  let offset = STL_HEADER_BYTES + 4;

  for (let faceIndex = 0; faceIndex < metadata.faceCount; faceIndex += 1) {
    offset += 12;
    const base = faceIndex * 9;
    for (let coordIndex = 0; coordIndex < 9; coordIndex += 1) {
      triangles[base + coordIndex] = buffer.readFloatLE(offset);
      offset += 4;
    }
    offset += 2;
  }

  return {
    ...metadata,
    header: Buffer.from(buffer.subarray(0, STL_HEADER_BYTES)),
    triangles,
  };
}

export function readAsciiStl(filePath: string): StlTriangleMesh {
  const content = fs.readFileSync(filePath, "utf8");
  const vertices: number[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const match of content.matchAll(ASCII_VERTEX_PATTERN)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const z = Number(match[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    vertices.push(x, y, z);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (vertices.length === 0 || vertices.length % 9 !== 0) {
    throw new Error(`Unsupported STL format for ${filePath}. No complete ASCII triangle records were found.`);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    isBinary: false,
    vertexCount: vertices.length / 3,
    triangles: Float32Array.from(vertices),
  };
}

export function computeTriangleBounds(triangles: Float32Array): TriangleBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < triangles.length; index += 3) {
    const x = triangles[index];
    const y = triangles[index + 1];
    const z = triangles[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
    };
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

export function readBinaryStlBounds(filePath: string): TriangleBounds {
  return computeTriangleBounds(readBinaryStl(filePath).triangles);
}

const ASCII_VERTEX_PATTERN =
  /vertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;

export function readAsciiStlBounds(filePath: string): TriangleBounds {
  const content = fs.readFileSync(filePath, "utf8");
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let matched = 0;

  for (const match of content.matchAll(ASCII_VERTEX_PATTERN)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const z = Number(match[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    matched += 1;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (matched === 0) {
    throw new Error(`Unsupported STL format for ${filePath}. No ASCII vertex records were found.`);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

export function readStlBounds(filePath: string): StlBounds {
  const buffer = fs.readFileSync(filePath);
  const binaryMetadata = inspectBinaryStlBuffer(buffer);
  if (binaryMetadata.isBinary) {
    const bounds = computeTriangleBounds(readBinaryStl(filePath).triangles);
    return {
      ...bounds,
      isBinary: true,
      vertexCount: binaryMetadata.faceCount * 3,
    };
  }

  const content = buffer.toString("utf8");
  let vertexCount = 0;
  for (const _ of content.matchAll(ASCII_VERTEX_PATTERN)) {
    vertexCount += 1;
  }
  const bounds = readAsciiStlBounds(filePath);
  return {
    ...bounds,
    isBinary: false,
    vertexCount,
  };
}

export function readStlTriangles(filePath: string): StlTriangleMesh {
  const binary = inspectBinaryStlFile(filePath);
  if (binary.isBinary) {
    const mesh = readBinaryStl(filePath);
    const bounds = computeTriangleBounds(mesh.triangles);
    return {
      ...bounds,
      isBinary: true,
      vertexCount: mesh.triangles.length / 3,
      triangles: mesh.triangles,
    };
  }

  return readAsciiStl(filePath);
}

export function simplifyBinaryStlTriangles(
  triangles: Float32Array,
  divisions: number
): Float32Array {
  if (divisions < 2) {
    throw new Error(`Invalid simplification divisions: ${divisions}. Expected at least 2.`);
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < triangles.length; index += 3) {
    const x = triangles[index];
    const y = triangles[index + 1];
    const z = triangles[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const stepX = Math.max((maxX - minX) / divisions, STL_MIN_EDGE);
  const stepY = Math.max((maxY - minY) / divisions, STL_MIN_EDGE);
  const stepZ = Math.max((maxZ - minZ) / divisions, STL_MIN_EDGE);
  const base = divisions + 1;

  const cells = new Map<
    number,
    { sumX: number; sumY: number; sumZ: number; count: number; cx?: number; cy?: number; cz?: number }
  >();

  for (let index = 0; index < triangles.length; index += 3) {
    const x = triangles[index];
    const y = triangles[index + 1];
    const z = triangles[index + 2];
    const ix = clipIndex(Math.floor((x - minX) / stepX), divisions);
    const iy = clipIndex(Math.floor((y - minY) / stepY), divisions);
    const iz = clipIndex(Math.floor((z - minZ) / stepZ), divisions);
    const key = ix + iy * base + iz * base * base;
    const cell = cells.get(key);
    if (cell) {
      cell.sumX += x;
      cell.sumY += y;
      cell.sumZ += z;
      cell.count += 1;
    } else {
      cells.set(key, { sumX: x, sumY: y, sumZ: z, count: 1 });
    }
  }

  for (const cell of cells.values()) {
    cell.cx = cell.sumX / cell.count;
    cell.cy = cell.sumY / cell.count;
    cell.cz = cell.sumZ / cell.count;
  }

  const simplified: number[] = [];
  const minEdgeSquared = STL_MIN_EDGE * STL_MIN_EDGE;

  for (let index = 0; index < triangles.length; index += 9) {
    const coords: number[] = [];
    for (let vertexOffset = 0; vertexOffset < 9; vertexOffset += 3) {
      const x = triangles[index + vertexOffset];
      const y = triangles[index + vertexOffset + 1];
      const z = triangles[index + vertexOffset + 2];
      const ix = clipIndex(Math.floor((x - minX) / stepX), divisions);
      const iy = clipIndex(Math.floor((y - minY) / stepY), divisions);
      const iz = clipIndex(Math.floor((z - minZ) / stepZ), divisions);
      const key = ix + iy * base + iz * base * base;
      const cell = cells.get(key);
      if (!cell || cell.cx === undefined || cell.cy === undefined || cell.cz === undefined) {
        throw new Error("Failed to resolve centroid while simplifying STL.");
      }
      coords.push(cell.cx, cell.cy, cell.cz);
    }

    const edgeA = squaredDistance(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
    const edgeB = squaredDistance(coords[3], coords[4], coords[5], coords[6], coords[7], coords[8]);
    const edgeC = squaredDistance(coords[6], coords[7], coords[8], coords[0], coords[1], coords[2]);
    if (edgeA <= minEdgeSquared || edgeB <= minEdgeSquared || edgeC <= minEdgeSquared) {
      continue;
    }

    simplified.push(...coords);
  }

  return Float32Array.from(simplified);
}

export function chooseSimplifiedBinaryStl(
  triangles: Float32Array,
  maxFaces: number,
  candidateDivisions: number[] = [160, 128, 112, 96, 80, 72, 64, 56, 48, 40, 32, 24, 16, 12, 8, 6, 4, 3, 2]
): SimplifiedBinaryStl {
  const originalFaceCount = triangles.length / 9;
  if (originalFaceCount <= maxFaces) {
    return {
      divisions: Number.POSITIVE_INFINITY,
      faceCount: originalFaceCount,
      triangles,
    };
  }

  let fallback: SimplifiedBinaryStl | null = null;
  for (const divisions of candidateDivisions) {
    const simplified = simplifyBinaryStlTriangles(triangles, divisions);
    const faceCount = simplified.length / 9;
    if (!fallback || faceCount < fallback.faceCount) {
      fallback = { divisions, faceCount, triangles: simplified };
    }
    if (faceCount > 0 && faceCount <= maxFaces) {
      return { divisions, faceCount, triangles: simplified };
    }
  }

  if (fallback && fallback.faceCount > 0) {
    return fallback;
  }

  throw new Error("Could not simplify STL mesh to a non-empty triangle set.");
}

export function writeBinaryStl(
  filePath: string,
  header: Buffer,
  triangles: Float32Array
): void {
  const faceCount = triangles.length / 9;
  const buffer = Buffer.alloc(STL_HEADER_BYTES + 4 + faceCount * STL_RECORD_BYTES);
  const normalizedHeader = Buffer.alloc(STL_HEADER_BYTES, 0x20);
  header.copy(normalizedHeader, 0, 0, Math.min(header.length, STL_HEADER_BYTES));
  normalizedHeader.copy(buffer, 0);
  buffer.writeUInt32LE(faceCount, STL_COUNT_OFFSET);

  let offset = STL_HEADER_BYTES + 4;
  for (let index = 0; index < triangles.length; index += 9) {
    const ax = triangles[index];
    const ay = triangles[index + 1];
    const az = triangles[index + 2];
    const bx = triangles[index + 3];
    const by = triangles[index + 4];
    const bz = triangles[index + 5];
    const cx = triangles[index + 6];
    const cy = triangles[index + 7];
    const cz = triangles[index + 8];

    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const normalLength = Math.hypot(nx, ny, nz);
    if (normalLength > STL_MIN_EDGE) {
      nx /= normalLength;
      ny /= normalLength;
      nz /= normalLength;
    } else {
      nx = 0;
      ny = 0;
      nz = 0;
    }

    buffer.writeFloatLE(nx, offset);
    buffer.writeFloatLE(ny, offset + 4);
    buffer.writeFloatLE(nz, offset + 8);
    offset += 12;

    for (let vertexOffset = 0; vertexOffset < 9; vertexOffset += 1) {
      buffer.writeFloatLE(triangles[index + vertexOffset], offset);
      offset += 4;
    }

    buffer.writeUInt16LE(0, offset);
    offset += 2;
  }

  fs.writeFileSync(filePath, buffer);
}

import * as fs from "node:fs";
import * as path from "node:path";
import {
  chooseSimplifiedBinaryStl,
  inspectBinaryStlFile,
  readBinaryStl,
  writeBinaryStl,
} from "./stlBinary";

export const DEFAULT_MUJOCO_MAX_STL_FACES = 200_000;

export interface MujocoMeshPrepOptions {
  meshDir: string;
  maxFaces?: number;
  inPlace?: boolean;
  outDir?: string;
}

export interface MujocoMeshPrepResultEntry {
  path: string;
  format: string;
  faceCountBefore: number;
  faceCountAfter: number;
  changed: boolean;
  divisions: number | null;
  reason: string | null;
}

export interface MujocoMeshPrepResult {
  meshDir: string;
  targetDir: string | null;
  maxFaces: number;
  inspected: number;
  overLimit: number;
  rewritten: number;
  results: MujocoMeshPrepResultEntry[];
}

const listFilesRecursive = (rootDir: string): string[] => {
  const results: string[] = [];
  const walk = (dirPath: string) => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile()) {
        results.push(entryPath);
      }
    }
  };
  walk(rootDir);
  return results;
};

export function prepareMujocoMeshes(options: MujocoMeshPrepOptions): MujocoMeshPrepResult {
  const meshDir = path.resolve(options.meshDir);
  const outDir = options.outDir ? path.resolve(options.outDir) : undefined;
  const maxFaces = options.maxFaces ?? DEFAULT_MUJOCO_MAX_STL_FACES;
  const shouldWrite = Boolean(options.inPlace || outDir);

  if (options.inPlace && outDir) {
    throw new Error("prepareMujocoMeshes accepts either inPlace or outDir, not both.");
  }
  if (!fs.existsSync(meshDir) || !fs.statSync(meshDir).isDirectory()) {
    throw new Error(`Mesh directory does not exist: ${meshDir}`);
  }

  if (outDir) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.cpSync(meshDir, outDir, { recursive: true });
  }

  const results: MujocoMeshPrepResultEntry[] = [];
  let overLimit = 0;
  let rewritten = 0;

  for (const absolutePath of listFilesRecursive(meshDir)) {
    const relativePath = path.relative(meshDir, absolutePath);
    const extension = path.extname(relativePath).toLowerCase();
    if (extension !== ".stl") {
      continue;
    }

    const metadata = inspectBinaryStlFile(absolutePath);
    const targetPath = outDir ? path.join(outDir, relativePath) : absolutePath;
    const entry: MujocoMeshPrepResultEntry = {
      path: relativePath,
      format: "stl",
      faceCountBefore: metadata.faceCount,
      faceCountAfter: metadata.faceCount,
      changed: false,
      divisions: null,
      reason: null,
    };

    if (!metadata.isBinary) {
      entry.reason = "Unsupported STL format. Expected a valid binary STL.";
      results.push(entry);
      continue;
    }

    if (metadata.faceCount > maxFaces) {
      overLimit += 1;
      if (shouldWrite) {
        const mesh = readBinaryStl(absolutePath);
        const simplified = chooseSimplifiedBinaryStl(mesh.triangles, maxFaces);
        writeBinaryStl(targetPath, mesh.header, simplified.triangles);
        entry.faceCountAfter = simplified.faceCount;
        entry.changed = simplified.faceCount !== metadata.faceCount;
        entry.divisions = Number.isFinite(simplified.divisions) ? simplified.divisions : null;
        rewritten += entry.changed ? 1 : 0;
        if (simplified.faceCount > maxFaces) {
          entry.reason = `Still above MuJoCo face limit after simplification: ${simplified.faceCount} > ${maxFaces}.`;
        }
      } else {
        entry.reason = `Over MuJoCo STL face limit: ${metadata.faceCount} > ${maxFaces}.`;
      }
    }

    results.push(entry);
  }

  return {
    meshDir,
    targetDir: outDir ?? (options.inPlace ? meshDir : null),
    maxFaces,
    inspected: results.length,
    overLimit,
    rewritten,
    results,
  };
}

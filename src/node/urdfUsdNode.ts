import * as fs from "node:fs";
import * as path from "node:path";
import {
  convertURDFToUSD,
  createInlineUsdMeshPrim,
  createUsdStage,
  type ConvertURDFToUSDOptions,
  type ResolvedUsdMesh,
  type URDFToUSDConversionResult,
  type UsdStage,
} from "../convert/urdfToUSD";
import { collectLocalRepositoryFiles, type LocalRepositoryFile } from "../repository/localRepositoryInspection";
import {
  normalizeRepositoryPath,
  resolveRepositoryFileReference,
} from "../repository/repositoryMeshResolution";
import { loadSourceFromPath, type LoadSourcePathOptions, type LoadSourceResult } from "../sources/loadSourceNode";
import { readStlTriangles } from "../mesh/stlBinary";

export type MeshUsdConversionResult = {
  sourcePath: string;
  usdPath: string;
  usdContent: string | null;
  wroteFile: boolean;
  warnings: string[];
  stage?: UsdStage;
};

export type ConvertLoadedSourceToUSDOptions = ConvertURDFToUSDOptions & {
  outputPath?: string;
  rootPath?: string;
};

export type ConvertLocalSourcePathToUSDOptions = LoadSourcePathOptions &
  ConvertLoadedSourceToUSDOptions;

export type LoadedSourceUSDConversionResult = URDFToUSDConversionResult & {
  outputPath: string | null;
  rootPath: string | null;
  entryPath: string | null;
};

const normalizeFsPath = (value: string): string => value.replace(/\\/g, "/");

const toUsdAssetPath = (absolutePath: string, outputPath?: string): string => {
  const normalizedAbsolute = normalizeFsPath(absolutePath);
  if (!outputPath) {
    return normalizedAbsolute;
  }
  const relative = normalizeFsPath(path.relative(path.dirname(outputPath), absolutePath));
  if (!relative || relative === ".") {
    return `./${path.basename(absolutePath)}`;
  }
  if (relative.startsWith(".")) {
    return relative;
  }
  return `./${relative}`;
};

const normalizeLoadedEntryPath = (
  rootPath: string | null,
  entryPath: string | null | undefined,
  fallbackPath: string | null | undefined
): string | null => {
  if (entryPath) {
    if (rootPath && path.isAbsolute(entryPath)) {
      return normalizeRepositoryPath(path.relative(rootPath, entryPath));
    }
    return normalizeRepositoryPath(entryPath);
  }
  if (rootPath && fallbackPath) {
    return normalizeRepositoryPath(path.relative(rootPath, fallbackPath));
  }
  if (fallbackPath) {
    return normalizeRepositoryPath(path.basename(fallbackPath));
  }
  return null;
};

const buildLocalMeshResolver = (
  files: LocalRepositoryFile[],
  entryPath: string,
  rootPath: string,
  outputPath?: string
) => {
  return (request: Parameters<NonNullable<ConvertURDFToUSDOptions["meshResolver"]>>[0]): ResolvedUsdMesh | null => {
    const file = resolveRepositoryFileReference(entryPath, request.meshRef, files);
    if (!file) {
      return {
        kind: "unsupported",
        sourcePath: request.meshRef,
        reason: "could not resolve the mesh reference inside the local repository",
      };
    }

    const absolutePath = file.absolutePath || path.resolve(rootPath, file.path);
    const extension = path.extname(absolutePath).toLowerCase();
    if (extension === ".stl") {
      const mesh = readStlTriangles(absolutePath);
      return {
        kind: "inline-triangles",
        mesh: {
          triangles: mesh.triangles,
          sourcePath: normalizeFsPath(file.path),
        },
      };
    }
    if (extension === ".usd" || extension === ".usda" || extension === ".usdc") {
      return {
        kind: "usd-reference",
        assetPath: toUsdAssetPath(absolutePath, outputPath),
      };
    }
    return {
      kind: "unsupported",
      sourcePath: request.meshRef,
      reason: `Only STL input and existing USD assets are supported for local mesh resolution. Received ${extension || "unknown"}.`,
    };
  };
};

const writeText = (targetPath: string, content: string) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
};

export function convertMeshToUsd(
  meshPath: string,
  options: {
    outPath?: string;
    upAxis?: "Y" | "Z";
    metersPerUnit?: number;
    kilogramsPerUnit?: number;
    write?: boolean;
  } = {}
): MeshUsdConversionResult {
  const absoluteMeshPath = path.resolve(meshPath);
  const extension = path.extname(absoluteMeshPath).toLowerCase();

  if (extension === ".usd" || extension === ".usda" || extension === ".usdc") {
    return {
      sourcePath: absoluteMeshPath,
      usdPath: absoluteMeshPath,
      usdContent: null,
      wroteFile: false,
      warnings: ["Mesh already points to a USD asset; no conversion was required."],
    };
  }

  if (extension !== ".stl") {
    throw new Error(`convertMeshToUsd accepts STL input only. Received ${extension || "unknown"}.`);
  }

  const targetPath =
    options.outPath ||
    path.join(path.dirname(absoluteMeshPath), `${path.basename(absoluteMeshPath, extension)}.usda`);
  const triangles = readStlTriangles(absoluteMeshPath);
  const meshPrim = createInlineUsdMeshPrim(
    {
      triangles: triangles.triangles,
      sourcePath: normalizeFsPath(absoluteMeshPath),
    },
    { name: "Mesh" }
  );
  const stage = createUsdStage(targetPath, {
    defaultPrim: "MeshAsset",
    upAxis: options.upAxis || "Z",
    metersPerUnit: options.metersPerUnit ?? 1,
    kilogramsPerUnit: options.kilogramsPerUnit ?? 1,
    rootPrims: [
      {
        name: "MeshAsset",
        typeName: "Xform",
        children: [meshPrim],
      },
    ],
  });
  const usdContent = stage.toUsda();
  const shouldWrite = options.write !== false;
  if (shouldWrite) {
    writeText(targetPath, usdContent);
  }

  return {
    sourcePath: absoluteMeshPath,
    usdPath: targetPath,
    usdContent,
    wroteFile: shouldWrite,
    warnings: [],
    stage,
  };
}

export async function convertLoadedSourceToUSD(
  source: LoadSourceResult,
  options: ConvertLoadedSourceToUSDOptions = {}
): Promise<LoadedSourceUSDConversionResult> {
  const rootPath = options.rootPath || source.rootPath || null;
  const entryPath = normalizeLoadedEntryPath(rootPath, source.entryPath, source.inspectedPath);
  const files =
    rootPath && entryPath
      ? await collectLocalRepositoryFiles(rootPath)
      : null;
  const meshResolver =
    files && rootPath && entryPath
      ? buildLocalMeshResolver(files, entryPath, rootPath, options.outputPath)
      : options.meshResolver;

  const result = convertURDFToUSD(source.urdf, {
    ...options,
    meshResolver,
  });

  if (options.outputPath) {
    writeText(options.outputPath, result.usdContent);
  }

  return {
    ...result,
    outputPath: options.outputPath || null,
    rootPath,
    entryPath,
  };
}

export async function convertURDFPathToUSD(
  urdfPath: string,
  options: ConvertLoadedSourceToUSDOptions = {}
): Promise<LoadedSourceUSDConversionResult> {
  const absoluteUrdfPath = path.resolve(urdfPath);
  const rootPath = options.rootPath || path.dirname(absoluteUrdfPath);
  return convertLoadedSourceToUSD(
    {
      source: "local-file",
      inspectedPath: absoluteUrdfPath,
      rootPath,
      entryPath: normalizeRepositoryPath(path.relative(rootPath, absoluteUrdfPath)),
      entryFormat: "urdf",
      inspectionMode: "urdf",
      urdf: fs.readFileSync(absoluteUrdfPath, "utf8"),
      runtime: null,
    },
    options
  );
}

export async function convertLocalSourcePathToUSD(
  options: ConvertLocalSourcePathToUSDOptions
): Promise<LoadedSourceUSDConversionResult> {
  const loaded = await loadSourceFromPath(options);
  return convertLoadedSourceToUSD(loaded, options);
}

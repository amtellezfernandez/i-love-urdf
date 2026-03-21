import {
  buildPackageRootsFromRepositoryFiles,
  buildRepositoryFileEntriesFromPaths,
  resolveRepositoryFileReference,
  type RepositoryFileEntry,
} from "../repository/repositoryMeshResolution";
import {
  normalizeMeshPathForMatch,
  parseMeshReference,
} from "./meshPaths";

export type MeshBlobMap = Record<string, Blob>;
export type PackageRootMap = Record<string, string[]>;

export type ResolveMeshBlobOptions = {
  basePath?: string;
  allowSchemeStrip?: boolean;
  allowDecode?: boolean;
  allowFilenameFallback?: boolean;
};

export type ResolvedMeshBlob = {
  path: string;
  blob: Blob;
};

const fileNameIndexCache = new WeakMap<MeshBlobMap, Map<string, ResolvedMeshBlob[]>>();
const lowerCasePathIndexCache = new WeakMap<MeshBlobMap, Map<string, ResolvedMeshBlob>>();
const repositoryFilesCache = new WeakMap<MeshBlobMap, RepositoryFileEntry[]>();
const inferredPackageRootsCache = new WeakMap<MeshBlobMap, PackageRootMap>();

const stripSchemes = (value: string) =>
  value.replace(/^package:\/\/[^/]+\//, "").replace(/^file:\/\//, "");

const normalizeBasePath = (basePath?: string) =>
  basePath ? normalizeMeshPathForMatch(basePath) : "";

const addCandidate = (set: Set<string>, value: string | undefined) => {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!set.has(trimmed)) {
    set.add(trimmed);
  }
  const normalized = normalizeMeshPathForMatch(trimmed);
  if (normalized && !set.has(normalized)) {
    set.add(normalized);
  }
  const noLeading = trimmed.replace(/^\/+/, "");
  if (noLeading && !set.has(noLeading)) {
    set.add(noLeading);
  }
  const normalizedNoLeading = normalizeMeshPathForMatch(noLeading);
  if (normalizedNoLeading && !set.has(normalizedNoLeading)) {
    set.add(normalizedNoLeading);
  }
};

const buildFileNameIndex = (meshFiles: MeshBlobMap) => {
  const index = new Map<string, ResolvedMeshBlob[]>();
  Object.entries(meshFiles).forEach(([path, blob]) => {
    const filename = path.split("/").pop() || path;
    const key = filename.toLowerCase();
    const entries = index.get(key);
    if (!entries) {
      index.set(key, [{ path, blob }]);
      return;
    }
    if (entries.some((entry) => entry.blob === blob)) return;
    entries.push({ path, blob });
  });
  return index;
};

const buildLowerCasePathIndex = (meshFiles: MeshBlobMap) => {
  const index = new Map<string, ResolvedMeshBlob>();
  Object.entries(meshFiles).forEach(([path, blob]) => {
    const key = path.toLowerCase();
    if (!index.has(key)) {
      index.set(key, { path, blob });
    }
    const normalized = normalizeMeshPathForMatch(path);
    if (normalized) {
      const normalizedKey = normalized.toLowerCase();
      if (!index.has(normalizedKey)) {
        index.set(normalizedKey, { path, blob });
      }
    }
  });
  return index;
};

const getFileNameIndex = (meshFiles: MeshBlobMap) => {
  const cached = fileNameIndexCache.get(meshFiles);
  if (cached) return cached;
  const index = buildFileNameIndex(meshFiles);
  fileNameIndexCache.set(meshFiles, index);
  return index;
};

const getLowerCasePathIndex = (meshFiles: MeshBlobMap) => {
  const cached = lowerCasePathIndexCache.get(meshFiles);
  if (cached) return cached;
  const index = buildLowerCasePathIndex(meshFiles);
  lowerCasePathIndexCache.set(meshFiles, index);
  return index;
};

const getRepositoryFiles = (meshFiles: MeshBlobMap) => {
  const cached = repositoryFilesCache.get(meshFiles);
  if (cached) return cached;
  const files = buildRepositoryFileEntriesFromPaths(Object.keys(meshFiles)) as RepositoryFileEntry[];
  repositoryFilesCache.set(meshFiles, files);
  return files;
};

export const buildPackageRootsFromMeshBlobMap = (meshFiles: MeshBlobMap): PackageRootMap =>
  buildPackageRootsFromRepositoryFiles(getRepositoryFiles(meshFiles));

const getInferredPackageRoots = (meshFiles: MeshBlobMap): PackageRootMap => {
  const cached = inferredPackageRootsCache.get(meshFiles);
  if (cached) return cached;
  const roots = buildPackageRootsFromMeshBlobMap(meshFiles);
  inferredPackageRootsCache.set(meshFiles, roots);
  return roots;
};

const buildMeshPathCandidates = (rawPath: string, options: ResolveMeshBlobOptions = {}) => {
  const candidates = new Set<string>();
  const allowSchemeStrip = options.allowSchemeStrip !== false;
  const allowDecode = options.allowDecode !== false;
  const normalizedBasePath = normalizeBasePath(options.basePath);

  const trimmed = rawPath.trim();
  const stripped = allowSchemeStrip ? stripSchemes(trimmed) : trimmed;
  const filename = stripped.split("/").pop() || stripped;
  const withoutFirstFolder = stripped.replace(/^.*?\//, "");

  if (normalizedBasePath) {
    addCandidate(candidates, `${normalizedBasePath}/${stripped}`);
    addCandidate(candidates, `${normalizedBasePath}/${filename}`);
  }

  addCandidate(candidates, trimmed);
  addCandidate(candidates, stripped);
  addCandidate(candidates, filename);
  addCandidate(candidates, withoutFirstFolder);
  const commonFolders = ["meshes", "mesh", "assets", "asset", "models", "model", "resources", "resource"];
  commonFolders.forEach((folder) => {
    addCandidate(candidates, `${folder}/${filename}`);
    addCandidate(candidates, `/${folder}/${filename}`);
  });

  if (allowDecode) {
    try {
      addCandidate(candidates, decodeURIComponent(trimmed));
      addCandidate(candidates, decodeURIComponent(stripped));
      addCandidate(candidates, decodeURIComponent(filename));
    } catch {
      // ignore decode errors
    }
  }

  return Array.from(candidates);
};

const buildUrdfRepositoryPath = (basePath?: string) => {
  const normalizedBase = normalizeBasePath(basePath);
  return normalizedBase ? `${normalizedBase}/robot.urdf` : "robot.urdf";
};

const isUnderBasePath = (path: string, normalizedBasePath: string) => {
  if (!normalizedBasePath) return false;
  const normalizedPath = normalizeMeshPathForMatch(path);
  if (!normalizedPath) return false;
  return (
    normalizedPath === normalizedBasePath ||
    normalizedPath.startsWith(`${normalizedBasePath}/`) ||
    normalizedBasePath.startsWith(`${normalizedPath}/`)
  );
};

const pickFilenameFallbackMatch = (
  entries: ResolvedMeshBlob[] | undefined,
  basePath?: string
): ResolvedMeshBlob | null => {
  if (!entries || entries.length === 0) return null;
  if (entries.length === 1) return entries[0];

  const normalizedBasePath = normalizeBasePath(basePath);
  if (!normalizedBasePath) {
    return null;
  }

  const scoped = entries.filter((entry) => isUnderBasePath(entry.path, normalizedBasePath));
  if (scoped.length === 1) return scoped[0];

  return null;
};

export const resolveMeshBlob = (
  rawPath: string,
  meshFiles: MeshBlobMap | undefined,
  options: ResolveMeshBlobOptions = {}
): ResolvedMeshBlob | null => {
  if (!meshFiles) return null;
  const candidates = buildMeshPathCandidates(rawPath, options);
  for (const candidate of candidates) {
    if (meshFiles[candidate]) {
      return { path: candidate, blob: meshFiles[candidate] };
    }
  }

  const lowerCaseIndex = getLowerCasePathIndex(meshFiles);
  for (const candidate of candidates) {
    const normalized = normalizeMeshPathForMatch(candidate);
    const lookup = normalized ? normalized.toLowerCase() : candidate.toLowerCase();
    const match = lowerCaseIndex.get(lookup);
    if (match) return match;
  }

  if (options.allowFilenameFallback === false) {
    return null;
  }

  const stripped = options.allowSchemeStrip === false ? rawPath : stripSchemes(rawPath);
  const filename = stripped.split("/").pop() || stripped;
  const index = getFileNameIndex(meshFiles);
  return pickFilenameFallbackMatch(index.get(filename.toLowerCase()), options.basePath);
};

export const resolveMeshBlobFromReference = (
  meshRef: string,
  meshFiles: MeshBlobMap | undefined,
  basePath?: string,
  packageRoots?: PackageRootMap
): ResolvedMeshBlob | null => {
  const refInfo = parseMeshReference(meshRef);
  if (refInfo.isAbsoluteFile) {
    return null;
  }
  if (!meshFiles) return null;

  const resolvedFile = resolveRepositoryFileReference(
    buildUrdfRepositoryPath(basePath),
    meshRef,
    getRepositoryFiles(meshFiles),
    {
      packageRoots: packageRoots ?? getInferredPackageRoots(meshFiles),
    }
  );
  if (resolvedFile) {
    const normalizedResolvedPath = normalizeMeshPathForMatch(resolvedFile.path);
    if (normalizedResolvedPath) {
      const match = getLowerCasePathIndex(meshFiles).get(normalizedResolvedPath.toLowerCase());
      if (match) {
        return match;
      }
    }
  }

  const resolvedPath = refInfo.path || refInfo.raw;
  const normalizedBase = normalizeBasePath(basePath);
  return resolveMeshBlob(resolvedPath, meshFiles, {
    allowSchemeStrip: true,
    basePath: normalizedBase,
  });
};

export const resolveMeshResourceBlob = (
  uri: string,
  meshFiles: MeshBlobMap | undefined,
  basePath: string | undefined
): ResolvedMeshBlob | null => {
  const cleaned = uri.split("?")[0]?.split("#")[0] ?? uri;
  if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("http")) {
    return null;
  }
  return resolveMeshBlob(cleaned, meshFiles, {
    basePath,
    allowSchemeStrip: false,
  });
};

export const stripMeshSchemes = (value: string) => stripSchemes(value);

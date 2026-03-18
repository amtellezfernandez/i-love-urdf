import { analyzeUrdf } from "../analysis/analyzeUrdf";
import { SUPPORTED_MESH_EXTENSIONS } from "../mesh/meshFormats";
import { normalizeMeshPathForMatch, parseMeshReference } from "../mesh/meshPaths";
import { isXacroSupportPath } from "../xacro/xacroContract";

export type RepositoryFileEntry = {
  path: string;
  type: "file" | "dir";
};

export type PackageNameByPath =
  | ReadonlyMap<string, string | null | undefined>
  | Record<string, string | null | undefined>;

export type BuildPackageRootsOptions = {
  packageNameByPath?: PackageNameByPath;
};

const COMMON_PACKAGE_FOLDERS = new Set([
  "meshes",
  "mesh",
  "assets",
  "asset",
  "resources",
  "resource",
  "urdf",
  "xml",
  "models",
  "model",
  "visual",
  "collision",
  "textures",
  "texture",
  "materials",
  "material",
]);

export const normalizeRepositoryPath = (path: string): string => {
  if (!path) return "";
  return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
};

export const extractPackageNameFromPackageXml = (content: string): string | null => {
  const match = content.match(/<name>\s*([^<]+)\s*<\/name>/i);
  const packageName = match?.[1]?.trim() ?? "";
  return packageName || null;
};

export const buildRepositoryFileEntriesFromPaths = (
  paths: Iterable<string>
): RepositoryFileEntry[] => {
  const files = new Map<string, RepositoryFileEntry>();
  for (const path of paths) {
    const normalized = normalizeRepositoryPath(path);
    if (!normalized) continue;
    files.set(normalized, { path: normalized, type: "file" });
  }
  return Array.from(files.values()).sort((left, right) => left.path.localeCompare(right.path));
};

export const repositoryDirname = (path: string): string => {
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex >= 0 ? path.substring(0, lastSlashIndex) : "";
};

const resolveMeshPath = (urdfDir: string, meshRef: string): string => {
  const refInfo = parseMeshReference(meshRef);
  if (refInfo.isAbsoluteFile) {
    return "";
  }

  const path = normalizeMeshPathForMatch(refInfo.path || refInfo.raw);
  if (!path) {
    return "";
  }

  if (!urdfDir) {
    return normalizeRepositoryPath(path);
  }

  const urdfParts = urdfDir.split("/").filter(Boolean);
  const meshParts = path.split("/").filter(Boolean);
  const resolvedParts: string[] = [...urdfParts];

  for (const part of meshParts) {
    if (part === "..") {
      if (resolvedParts.length > 0) {
        resolvedParts.pop();
      }
    } else if (part !== "." && part !== "") {
      resolvedParts.push(part);
    }
  }

  return normalizeRepositoryPath(resolvedParts.join("/"));
};

const startsWithMeshFolder = (meshRef: string): boolean => {
  const lower = meshRef.toLowerCase();
  return (
    lower.startsWith("meshes/") ||
    lower.startsWith("meshes\\") ||
    lower.startsWith("assets/") ||
    lower.startsWith("assets\\")
  );
};

const tryResolveFromParent = <T extends RepositoryFileEntry>(
  urdfDir: string,
  meshRef: string,
  lowerCaseFileMap: Map<string, T>
): T | null => {
  const urdfDirParts = urdfDir.split("/").filter(Boolean);
  if (urdfDirParts.length === 0) return null;

  const parentDir = urdfDirParts.slice(0, -1).join("/");
  const hasMeshPrefix = startsWithMeshFolder(meshRef);

  if (hasMeshPrefix) {
    const resolved = resolveMeshPath(parentDir, meshRef);
    if (resolved) {
      const file = lowerCaseFileMap.get(resolved.toLowerCase());
      if (file) {
        return file;
      }
    }
  } else {
    for (const folderName of ["meshes", "assets"]) {
      const meshRefWithFolder = `${folderName}/${meshRef}`;
      const resolved = resolveMeshPath(parentDir, meshRefWithFolder);
      if (resolved) {
        const file = lowerCaseFileMap.get(resolved.toLowerCase());
        if (file) {
          return file;
        }
      }
    }
  }

  return null;
};

export const resolveMeshPathInRepository = <T extends RepositoryFileEntry>(
  urdfPath: string,
  meshRef: string,
  lowerCaseFileMap: Map<string, T>
): T | null => {
  const urdfDir = repositoryDirname(urdfPath);
  const resolved = resolveMeshPath(urdfDir, meshRef);
  if (!resolved) {
    return null;
  }

  let file = lowerCaseFileMap.get(resolved.toLowerCase());
  if (file) {
    return file;
  }

  if (urdfDir) {
    file = tryResolveFromParent(urdfDir, meshRef, lowerCaseFileMap);
    if (file) {
      return file;
    }
  }

  return null;
};

export const collectXacroSupportFilesFromRepository = <T extends RepositoryFileEntry>(
  files: T[],
  targetPath: string
): T[] => {
  const supportFiles = files.filter(
    (file) => file.type === "file" && isXacroSupportPath(file.path)
  );
  const normalizedTarget = normalizeMeshPathForMatch(targetPath);
  const hasTarget = supportFiles.some(
    (file) => normalizeMeshPathForMatch(file.path) === normalizedTarget
  );
  if (hasTarget) {
    return supportFiles;
  }
  const targetFile = files.find((file) => file.type === "file" && file.path === targetPath);
  return targetFile ? [...supportFiles, targetFile] : supportFiles;
};

const getPackageNameOverride = (
  packageNameByPath: PackageNameByPath | undefined,
  path: string
): string | null => {
  if (!packageNameByPath) return null;
  const normalizedPath = normalizeRepositoryPath(path);
  if (packageNameByPath instanceof Map) {
    return packageNameByPath.get(normalizedPath)?.trim() || packageNameByPath.get(path)?.trim() || null;
  }
  return packageNameByPath[normalizedPath]?.trim() || packageNameByPath[path]?.trim() || null;
};

export const buildPackageRootsFromRepositoryFiles = <T extends RepositoryFileEntry>(
  files: T[],
  options: BuildPackageRootsOptions = {}
): Record<string, string[]> => {
  const roots = new Map<string, Set<string>>();
  const addRoot = (packageName: string, rootPath: string) => {
    if (!packageName || !rootPath) return;
    let entry = roots.get(packageName);
    if (!entry) {
      entry = new Set<string>();
      roots.set(packageName, entry);
    }
    entry.add(rootPath);
  };

  files.forEach((file) => {
    if (file.type !== "file") return;
    const lowerPath = file.path.toLowerCase();
    if (lowerPath.endsWith("/package.xml")) {
      const rootPath = repositoryDirname(file.path);
      if (!rootPath) return;
      const parts = rootPath.split("/").filter(Boolean);
      const packageName =
        getPackageNameOverride(options.packageNameByPath, file.path) ?? parts[parts.length - 1];
      if (packageName) {
        addRoot(packageName, rootPath);
      }
      return;
    }

    const normalized = normalizeMeshPathForMatch(file.path);
    if (!normalized) return;
    const parts = normalized.split("/").filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts[i + 1]?.toLowerCase();
      if (!folder || !COMMON_PACKAGE_FOLDERS.has(folder)) continue;
      const packageName = parts[i];
      if (!packageName) continue;
      const rootPath = parts.slice(0, i + 1).join("/");
      addRoot(packageName, rootPath);
    }
  });

  const output: Record<string, string[]> = {};
  roots.forEach((set, name) => {
    output[name] = Array.from(set);
  });
  return output;
};

const parseMeshDirOverride = (urdfText: string): string => {
  const match = urdfText.match(/<compiler[^>]*meshdir=["']([^"']+)["'][^>]*>/i);
  const meshDir = match?.[1]?.trim() ?? "";
  return normalizeMeshPathForMatch(meshDir);
};

const buildExtensionCandidates = (
  path: string,
  supportedMeshExtensions: readonly string[]
): string[] => {
  const normalized = normalizeMeshPathForMatch(path);
  if (!normalized) return [];
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return [];
  const filename = parts.pop() ?? normalized;
  const match = filename.match(/^(.*?)(\.[^.]+)?$/);
  const baseName = match?.[1] ?? filename;
  const prefix = parts.length > 0 ? `${parts.join("/")}/` : "";
  return supportedMeshExtensions.map((ext) => `${prefix}${baseName}${ext}`);
};

const findFileByCandidates = <T extends RepositoryFileEntry>(
  candidates: string[],
  lowerCaseFileMap: Map<string, T>
): T | null => {
  for (const candidate of candidates) {
    const normalized = normalizeMeshPathForMatch(candidate);
    if (!normalized) continue;
    const match = lowerCaseFileMap.get(normalized.toLowerCase());
    if (match) return match;
  }
  return null;
};

const getPackageRootCandidates = (
  packageName: string,
  packageRoots: Record<string, string[]>,
  urdfPath: string
): string[] => {
  const roots = new Set<string>();
  const direct = packageRoots[packageName] ?? [];
  direct.forEach((root) => roots.add(normalizeMeshPathForMatch(root)));

  const urdfParts = normalizeMeshPathForMatch(urdfPath).split("/").filter(Boolean);
  const index = urdfParts.indexOf(packageName);
  if (index !== -1) {
    roots.add(urdfParts.slice(0, index + 1).join("/"));
  }

  return Array.from(roots).filter(Boolean);
};

export const resolveRepositoryFileReference = <T extends RepositoryFileEntry>(
  urdfPath: string,
  meshRef: string,
  files: T[],
  options?: {
    packageRoots?: Record<string, string[]>;
    supportedMeshExtensions?: readonly string[];
    meshDirOverride?: string;
  }
): T | null => {
  if (!meshRef) return null;
  if (
    meshRef.startsWith("http://") ||
    meshRef.startsWith("https://") ||
    meshRef.startsWith("data:")
  ) {
    return null;
  }

  const lowerCaseFileMap = new Map<string, T>();
  files.forEach((file) => {
    if (file.type !== "file") return;
    const normalized = normalizeRepositoryPath(file.path);
    lowerCaseFileMap.set(normalized.toLowerCase(), file);
  });

  const packageRoots = options?.packageRoots ?? buildPackageRootsFromRepositoryFiles(files);
  const supportedMeshExtensions =
    options?.supportedMeshExtensions ?? SUPPORTED_MESH_EXTENSIONS;
  const meshDirOverride = normalizeMeshPathForMatch(options?.meshDirOverride ?? "");
  const urdfDir = repositoryDirname(urdfPath);
  const parentDir = repositoryDirname(urdfDir);

  const refInfo = parseMeshReference(meshRef);
  if (refInfo.isAbsoluteFile) {
    return null;
  }

  const rawPath = refInfo.path || refInfo.raw;
  const normalizedPath = normalizeMeshPathForMatch(rawPath);
  const candidates: string[] = [];
  const addCandidate = (candidate: string) => {
    if (!candidate) return;
    if (!candidates.includes(candidate)) candidates.push(candidate);
  };

  if (refInfo.scheme === "package" && refInfo.packageName) {
    const roots = getPackageRootCandidates(refInfo.packageName, packageRoots, urdfPath);
    roots.forEach((root) => {
      const combined = normalizedPath ? `${root}/${normalizedPath}` : `${root}/${rawPath}`;
      addCandidate(combined);
    });
    if (normalizedPath) {
      addCandidate(`${urdfDir}/${normalizedPath}`);
      if (parentDir) {
        addCandidate(`${parentDir}/${normalizedPath}`);
      }
      if (normalizedPath.startsWith("meshes/") || normalizedPath.startsWith("assets/")) {
        if (parentDir) {
          addCandidate(`${parentDir}/${normalizedPath}`);
        }
      }
      if (!normalizedPath.includes("/")) {
        addCandidate(`${urdfDir}/meshes/${normalizedPath}`);
        addCandidate(`${urdfDir}/assets/${normalizedPath}`);
        if (parentDir) {
          addCandidate(`${parentDir}/meshes/${normalizedPath}`);
          addCandidate(`${parentDir}/assets/${normalizedPath}`);
        }
      }
    }
  } else {
    const combined = normalizedPath ? `${urdfDir}/${normalizedPath}` : `${urdfDir}/${rawPath}`;
    addCandidate(combined);
    if (meshDirOverride) {
      addCandidate(`${urdfDir}/${meshDirOverride}/${normalizedPath || rawPath}`);
    }
    if (
      normalizedPath &&
      (normalizedPath.startsWith("meshes/") || normalizedPath.startsWith("assets/"))
    ) {
      addCandidate(`${parentDir}/${normalizedPath}`);
    }
    if (normalizedPath && !normalizedPath.includes("/")) {
      addCandidate(`${urdfDir}/meshes/${normalizedPath}`);
      addCandidate(`${urdfDir}/assets/${normalizedPath}`);
      if (parentDir) {
        addCandidate(`${parentDir}/meshes/${normalizedPath}`);
        addCandidate(`${parentDir}/assets/${normalizedPath}`);
      }
    }
  }

  addCandidate(normalizedPath || rawPath);

  let file = findFileByCandidates(candidates, lowerCaseFileMap);
  if (!file && (normalizedPath || rawPath)) {
    const extensionCandidates = buildExtensionCandidates(
      normalizedPath || rawPath,
      supportedMeshExtensions
    );
    const expanded: string[] = [];
    candidates.forEach((candidate) => {
      expanded.push(...buildExtensionCandidates(candidate, supportedMeshExtensions));
    });
    file = findFileByCandidates([...extensionCandidates, ...expanded], lowerCaseFileMap);
  }

  return file;
};

export const resolveRepositoryMeshReferences = <T extends RepositoryFileEntry>(
  urdfPath: string,
  urdfText: string,
  files: T[],
  options?: {
    packageRoots?: Record<string, string[]>;
    supportedMeshExtensions?: readonly string[];
  }
): {
  matches: T[];
  matchByReference: Map<string, T>;
  unresolved: string[];
} => {
  const meshReferences = analyzeUrdf(urdfText).meshReferences;

  const packageRoots =
    options?.packageRoots ?? buildPackageRootsFromRepositoryFiles(files);
  const supportedMeshExtensions =
    options?.supportedMeshExtensions ?? SUPPORTED_MESH_EXTENSIONS;
  const meshDirOverride = parseMeshDirOverride(urdfText);
  const urdfDir = repositoryDirname(urdfPath);
  const parentDir = repositoryDirname(urdfDir);

  const matches: T[] = [];
  const matchByReference = new Map<string, T>();
  const unresolved: string[] = [];
  const seenPaths = new Set<string>();

  const addMatch = (ref: string, file: T) => {
    matchByReference.set(ref, file);
    if (!seenPaths.has(file.path)) {
      matches.push(file);
      seenPaths.add(file.path);
    }
  };

  for (const meshRef of meshReferences) {
    if (!meshRef) continue;
    if (
      meshRef.startsWith("http://") ||
      meshRef.startsWith("https://") ||
      meshRef.startsWith("data:")
    ) {
      continue;
    }
    const file = resolveRepositoryFileReference(urdfPath, meshRef, files, {
      packageRoots,
      supportedMeshExtensions,
      meshDirOverride,
    });

    if (file) {
      addMatch(meshRef, file);
    } else {
      unresolved.push(meshRef);
    }
  }

  return { matches, matchByReference, unresolved };
};

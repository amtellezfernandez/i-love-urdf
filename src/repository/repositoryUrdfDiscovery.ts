import { analyzeUrdf } from "../analysis/analyzeUrdf";
import {
  SUPPORTED_MESH_EXTENSIONS,
  extractExtension,
  isSupportedMeshExtension,
  isSupportedMeshResource,
} from "../mesh/meshFormats";
import { normalizeMeshPathForMatch, parseMeshReference } from "../mesh/meshPaths";
import {
  type RepositoryFileEntry,
  buildPackageRootsFromRepositoryFiles,
  repositoryDirname,
} from "./repositoryMeshResolution";
import { isUrdfXacroPath, isXacroPath } from "../xacro/xacroContract";

export type RepositoryNamedFileEntry = RepositoryFileEntry & {
  name: string;
};

export type RepositoryUrdfCandidate = {
  path: string;
  name: string;
  hasMeshesFolder: boolean;
  meshesFolderPath?: string;
  hasUnsupportedFormats?: boolean;
  unsupportedFormats?: string[];
  unmatchedMeshReferences?: string[];
  isXacro?: boolean;
};

const hasPathSegment = (repositoryPath: string, expectedSegment: string): boolean =>
  repositoryPath
    .split("/")
    .filter(Boolean)
    .some((segment) => segment.toLowerCase() === expectedSegment.toLowerCase());

const isIgnorableRepositoryMetadataFile = <T extends RepositoryNamedFileEntry>(file: T): boolean => {
  const loweredName = file.name.toLowerCase();
  if (loweredName.startsWith("._")) return true;
  if (loweredName === ".ds_store") return true;
  if (hasPathSegment(file.path, "__macosx")) return true;
  return false;
};

const findMeshFolder = <T extends RepositoryNamedFileEntry>(
  files: T[],
  dirPath: string
): T | undefined =>
  files.find(
    (file) =>
      file.type === "dir" &&
      (file.path.toLowerCase() === `${dirPath}/meshes`.toLowerCase() ||
        file.path.toLowerCase() === `${dirPath}/assets`.toLowerCase()) &&
      (file.name.toLowerCase() === "meshes" || file.name.toLowerCase() === "assets")
  );

const findMeshesFolderForUrdf = <T extends RepositoryNamedFileEntry>(
  files: T[],
  urdfDir: string
): string | undefined => {
  const sameDir = findMeshFolder(files, urdfDir);
  if (sameDir) return sameDir.path;

  if (urdfDir) {
    const pathParts = urdfDir.split("/").filter(Boolean);
    if (pathParts.length > 0) {
      const parentDir = pathParts.slice(0, -1).join("/");
      const sibling = findMeshFolder(files, parentDir);
      if (sibling) return sibling.path;
    }
  }

  const pathParts = urdfDir.split("/").filter(Boolean);
  for (let i = pathParts.length - 1; i >= Math.max(0, pathParts.length - 4); i -= 1) {
    const checkPath = pathParts.slice(0, i + 1).join("/");
    const parent = findMeshFolder(files, checkPath);
    if (parent) return parent.path;
  }

  return undefined;
};

const scoreRepositoryUrdfCandidate = (candidate: RepositoryUrdfCandidate): number => {
  const pathLower = candidate.path.toLowerCase();
  const nameLower = candidate.name.toLowerCase();
  let score = 0;

  if (candidate.hasMeshesFolder) score += 50;
  if (pathLower.includes("/urdf/")) score += 20;
  if (pathLower.includes("/robots/")) score += 10;
  if (pathLower.includes("/description/")) score += 10;
  if (nameLower.includes("robot")) score += 10;
  if (nameLower.includes("description")) score += 8;
  if (nameLower.includes("model")) score += 6;

  if (nameLower.startsWith("_")) score -= 40;
  if (nameLower.includes("macro")) score -= 30;
  if (nameLower.includes("gazebo")) score -= 25;
  if (nameLower.includes("material")) score -= 20;
  if (nameLower.includes("transmission")) score -= 20;
  if (nameLower.includes("sensor")) score -= 15;
  if (nameLower.includes("test")) score -= 15;
  if (nameLower.includes("common")) score -= 10;
  if (nameLower.includes("include")) score -= 10;

  if (candidate.isXacro) score -= 2;
  return score;
};

export const findRepositoryUrdfCandidates = <T extends RepositoryNamedFileEntry>(
  files: T[]
): RepositoryUrdfCandidate[] => {
  const candidateFiles = files.filter((file) => {
    if (file.type !== "file") return false;
    if (isIgnorableRepositoryMetadataFile(file)) return false;
    const lowered = file.name.toLowerCase();
    return lowered.endsWith(".urdf") || isXacroPath(lowered);
  });

  const candidates = candidateFiles.map((urdfFile) => {
    const urdfDir = repositoryDirname(urdfFile.path);
    const meshesFolderPath = findMeshesFolderForUrdf(files, urdfDir);

    return {
      path: urdfFile.path,
      name: urdfFile.name,
      hasMeshesFolder: Boolean(meshesFolderPath),
      meshesFolderPath,
      isXacro: isXacroPath(urdfFile.name),
    };
  });

  return candidates.sort((left, right) => {
    const scoreDiff = scoreRepositoryUrdfCandidate(right) - scoreRepositoryUrdfCandidate(left);
    if (scoreDiff !== 0) return scoreDiff;
    return left.path.localeCompare(right.path);
  });
};

export const extractMeshReferencesFromUrdf = (urdfContent: string): string[] => {
  const analysis = analyzeUrdf(urdfContent);
  if (!analysis.isValid) return [];
  return analysis.meshReferences;
};

export const detectUnsupportedMeshFormats = (
  urdfContent: string
): { hasUnsupported: boolean; formats: string[] } => {
  const meshReferences = extractMeshReferencesFromUrdf(urdfContent);
  const unsupportedFormats = new Set<string>();

  for (const meshRef of meshReferences) {
    const refInfo = parseMeshReference(meshRef);
    const normalized = normalizeMeshPathForMatch(refInfo.path || refInfo.raw);
    const extWithDot = extractExtension(normalized);
    if (extWithDot && !isSupportedMeshExtension(extWithDot)) {
      unsupportedFormats.add(extWithDot);
    }
  }

  return {
    hasUnsupported: unsupportedFormats.size > 0,
    formats: Array.from(unsupportedFormats).sort(),
  };
};

export const hasRenderableUrdfGeometry = (urdfText: string): boolean => {
  const analysis = analyzeUrdf(urdfText);
  if (!analysis.isValid) return false;
  if ((analysis.meshReferences?.length ?? 0) > 0) return true;
  return Object.values(analysis.linkDataByName ?? {}).some((linkData) => {
    const hasVisualPrimitive = (linkData.visuals ?? []).some(
      (visual) => visual.geometry.type !== null && visual.geometry.type !== "mesh"
    );
    if (hasVisualPrimitive) return true;
    return (linkData.collisions ?? []).some(
      (collision) => collision.geometry.type !== null && collision.geometry.type !== "mesh"
    );
  });
};

const PACKAGE_FIND_REGEX = /\$\(\s*find\s+([^) \t\r\n]+)\s*\)/g;
const PACKAGE_URI_REGEX = /package:\/\/([^/)\s"'<>]+)/g;

export const collectPackageNamesFromText = (text: string): string[] => {
  if (!text) return [];
  const names = new Set<string>();

  let match: RegExpExecArray | null;
  PACKAGE_FIND_REGEX.lastIndex = 0;
  while ((match = PACKAGE_FIND_REGEX.exec(text)) !== null) {
    const packageName = match[1]?.trim();
    if (packageName) names.add(packageName);
  }

  PACKAGE_URI_REGEX.lastIndex = 0;
  while ((match = PACKAGE_URI_REGEX.exec(text)) !== null) {
    const packageName = match[1]?.trim();
    if (packageName) names.add(packageName);
  }

  return Array.from(names);
};

export const collectMeshReferencedPackageNamesFromUrdf = (urdfText: string): string[] => {
  const names = new Set<string>();
  const refs = extractMeshReferencesFromUrdf(urdfText);

  refs.forEach((ref) => {
    const info = parseMeshReference(ref);
    if (info.scheme === "package" && info.packageName) {
      names.add(info.packageName);
    }
    PACKAGE_FIND_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PACKAGE_FIND_REGEX.exec(ref)) !== null) {
      const packageName = match[1]?.trim();
      if (packageName) names.add(packageName);
    }
  });

  return Array.from(names);
};

const normalizePackageLikeName = (name: string): string =>
  name.toLowerCase().replace(/[-_]/g, "");

export const buildDependencyRepositoryNameCandidates = (packageName: string): string[] => {
  const trimmed = packageName.trim();
  if (!trimmed) return [];
  const candidates = new Set<string>();
  const addCandidate = (value: string) => {
    const normalized = value.trim();
    if (normalized) candidates.add(normalized);
  };

  addCandidate(trimmed);
  addCandidate(trimmed.replace(/_/g, "-"));

  if (trimmed.endsWith("_description")) {
    const base = trimmed.replace(/_description$/, "");
    addCandidate(base);
    addCandidate(`${base}_ros`);
    addCandidate(`${base}-ros`);
    addCandidate(`${base}_robot`);
    addCandidate(`${base}-robot`);
  }

  if (trimmed.endsWith("_ros")) {
    const base = trimmed.replace(/_ros$/, "");
    addCandidate(base);
    addCandidate(`${base}_description`);
  }

  return Array.from(candidates);
};

export const repositoryContainsPackage = <T extends RepositoryFileEntry>(
  files: T[],
  packageName: string,
  repositoryName: string
): boolean => {
  const packageLower = packageName.toLowerCase();
  const packageXmlInFolder = files.some((file) => {
    if (file.type !== "file") return false;
    const lowerPath = file.path.toLowerCase();
    return (
      lowerPath === `${packageLower}/package.xml` ||
      lowerPath.endsWith(`/${packageLower}/package.xml`)
    );
  });
  if (packageXmlInFolder) return true;

  const hasRootPackageXml = files.some(
    (file) => file.type === "file" && file.path.toLowerCase() === "package.xml"
  );
  if (!hasRootPackageXml) return false;

  const normalizedRepo = normalizePackageLikeName(repositoryName);
  const normalizedPackage = normalizePackageLikeName(packageName);
  if (normalizedRepo === normalizedPackage) return true;

  const withoutDescription = packageName.replace(/_description$/, "");
  if (withoutDescription !== packageName) {
    return normalizedRepo === normalizePackageLikeName(withoutDescription);
  }

  return false;
};

export const findPackageXmlForPackageName = <T extends RepositoryFileEntry>(
  files: T[],
  packageName: string
): T | null => {
  const needle = `/${packageName.toLowerCase()}/package.xml`;
  for (const file of files) {
    if (file.type !== "file") continue;
    if (file.path.toLowerCase().endsWith(needle)) {
      return file;
    }
  }
  return null;
};

export const collectPackageResourceFilesForReferencedPackages = <T extends RepositoryFileEntry>(
  files: T[],
  packageNames: string[],
  packageRoots: Record<string, string[]> = buildPackageRootsFromRepositoryFiles(files)
): T[] => {
  return packageNames.flatMap((packageName) => {
    const roots = packageRoots[packageName] ?? [];
    if (roots.length === 0) return [];
    const normalizedRoots = roots
      .map((root) => normalizeMeshPathForMatch(root))
      .filter((root): root is string => Boolean(root));
    return files.filter((file) => {
      if (file.type !== "file" || !isSupportedMeshResource(file.path)) return false;
      const normalizedPath = normalizeMeshPathForMatch(file.path);
      if (!normalizedPath) return false;
      return normalizedRoots.some(
        (root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`)
      );
    });
  });
};

export const scoreXacroWrapperCandidate = (path: string): number => {
  const lower = path.toLowerCase();
  let score = 0;
  if (isUrdfXacroPath(lower)) score += 40;
  if (lower.includes("/robots/")) score += 20;
  if (lower.includes("/robot/")) score += 10;
  if (lower.includes("/common/")) score -= 40;
  if (lower.includes("macro")) score -= 25;
  if (lower.startsWith("_") || lower.includes("/_")) score -= 20;
  return score;
};

export const collectTargetPathHints = (targetPath: string): string[] => {
  const normalized = normalizeMeshPathForMatch(targetPath);
  if (!normalized) return [];
  const parts = normalized.split("/").filter(Boolean);
  const hints = new Set<string>();
  const fileName = parts[parts.length - 1];
  if (fileName) hints.add(fileName.toLowerCase());
  for (let depth = 2; depth <= 4; depth += 1) {
    if (parts.length < depth) break;
    hints.add(parts.slice(parts.length - depth).join("/").toLowerCase());
  }
  return Array.from(hints);
};

export const getSupportedMeshExtensions = (): readonly string[] => SUPPORTED_MESH_EXTENSIONS;

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
  normalizeRepositoryPath,
  repositoryDirname,
} from "./repositoryMeshResolution";
import { isUrdfXacroPath, isXacroPath } from "../xacro/xacroContract";

export type RepositoryNamedFileEntry = RepositoryFileEntry & {
  name: string;
};

export type RepositoryUrdfCandidate = {
  path: string;
  name: string;
  displayName: string;
  fileBase: string;
  sourceFile: string;
  hasMeshesFolder: boolean;
  meshesFolderPath?: string;
  hasUnsupportedFormats?: boolean;
  unsupportedFormats?: string[];
  unmatchedMeshReferences?: string[];
  isXacro?: boolean;
};

export type XacroArgumentDefinition = {
  name: string;
  hasDefault: boolean;
  defaultValue: string | null;
  isRequired: boolean;
};

const XML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const XACRO_ARG_TAG_REGEX = /<(?:[A-Za-z_][\w.-]*:)?arg\b([^<>]*)\/?>/gi;
const XML_ATTRIBUTE_REGEX = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const hasPathSegment = (repositoryPath: string, expectedSegment: string): boolean =>
  repositoryPath
    .split("/")
    .filter(Boolean)
    .some((segment) => segment.toLowerCase() === expectedSegment.toLowerCase());

const repositoryBasename = (repositoryPath: string): string => {
  const parts = repositoryPath.split("/").filter(Boolean);
  return parts[parts.length - 1]?.toLowerCase() ?? "";
};

const trimCompositeExtension = (value: string): string =>
  value.replace(/\.(urdf\.xacro|xacro|urdf)$/i, "");

const slugifyCandidateName = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const hashRepositoryPath = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const buildRepositoryCandidateDisplayName = (fileName: string): string => {
  const trimmed = trimCompositeExtension(fileName.split("/").pop() || fileName);
  return trimmed || "robot";
};

const buildRepositoryCandidateFileBase = (candidatePath: string): string => {
  const normalized = candidatePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const name = normalized.split("/").pop() || normalized;
  const slug = slugifyCandidateName(trimCompositeExtension(name)) || "robot";
  return `${slug}--${hashRepositoryPath(normalized)}`;
};

const stripCandidateExtension = (fileName: string): string =>
  fileName.toLowerCase().replace(/(\.urdf\.xacro|\.xacro|\.urdf)$/i, "");

const isIgnorableRepositoryMetadataFile = <T extends RepositoryNamedFileEntry>(file: T): boolean => {
  const loweredName = file.name.toLowerCase();
  if (loweredName.startsWith("._")) return true;
  if (loweredName === ".ds_store") return true;
  if (hasPathSegment(file.path, "__macosx")) return true;
  return false;
};

const isSupportXacroFile = (fileName: string): boolean => {
  const lowered = fileName.toLowerCase();
  if (!isXacroPath(lowered) || isUrdfXacroPath(lowered)) return false;
  const stem = lowered.replace(/\.xacro$/i, "");
  return (
    stem === "material" ||
    stem === "materials" ||
    stem === "gazebo" ||
    stem === "trans" ||
    stem === "transmission" ||
    stem === "transmissions" ||
    stem === "macro" ||
    stem === "macros" ||
    stem === "include" ||
    stem === "includes" ||
    stem === "common"
  );
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
  const candidateStem = stripCandidateExtension(nameLower);
  const parentDir = repositoryBasename(repositoryDirname(candidate.path));
  let score = 0;
  const isUrdfXacro = isUrdfXacroPath(nameLower);
  const isPlainUrdf = nameLower.endsWith(".urdf");

  if (candidate.hasMeshesFolder) score += 50;
  // In ROS repos, wrappers under robots/ are usually the instantiable entrypoints,
  // while urdf/ often contains support pieces and partial assemblies.
  if (pathLower.includes("/robots/")) score += 35;
  if (pathLower.includes("/urdf/")) score += 8;
  if (pathLower.includes("/description/")) score += 12;
  if (isUrdfXacro) score += 15;
  if (isPlainUrdf) score += 12;
  if (nameLower.includes("robot")) score += 10;
  if (nameLower.includes("description")) score += 8;
  if (nameLower.includes("model")) score += 6;
  if (parentDir && candidateStem === parentDir) score += 24;

  if (hasPathSegment(candidate.path, "config")) score -= 25;
  if (hasPathSegment(candidate.path, "launch")) score -= 20;
  if (hasPathSegment(candidate.path, "test")) score -= 20;
  if (hasPathSegment(candidate.path, "ros2_control")) score -= 15;
  if (hasPathSegment(candidate.path, "module")) score -= 12;
  if (pathLower.includes("simulation")) score -= 18;
  if (pathLower.includes("pybullet")) score -= 12;
  if (nameLower.startsWith("_")) score -= 40;
  if (nameLower.includes("macro")) score -= 30;
  if (nameLower.includes("gazebo")) score -= 25;
  if (nameLower.includes("material")) score -= 20;
  if (nameLower.includes("transmission")) score -= 20;
  if (nameLower.includes("sensor")) score -= 15;
  if (nameLower.includes("test")) score -= 15;
  if (nameLower.includes("common")) score -= 10;
  if (nameLower.includes("include")) score -= 10;
  if (parentDir && candidateStem.startsWith(`${parentDir}_`)) score -= 8;
  if (/_arm$|_base$|_gripper$|_head$|_end_effector$/.test(candidateStem)) score -= 6;
  if (candidateStem === "field" || candidateStem === "world") score -= 30;
  if (candidateStem === "arena" || candidateStem === "stadium") score -= 20;

  if (candidate.isXacro && !isUrdfXacro) score -= 10;
  else if (candidate.isXacro) score -= 2;
  return score;
};

const findRepositoryFileByPath = <T extends RepositoryFileEntry>(
  files: T[],
  targetPath: string
): T | null => {
  const normalizedTarget = normalizeMeshPathForMatch(targetPath);
  if (!normalizedTarget) return null;
  return (
    files.find(
      (file) =>
        file.type === "file" && normalizeMeshPathForMatch(file.path) === normalizedTarget
    ) ?? null
  );
};

const buildRepositoryXacroTargetPathCandidates = (targetPath: string): string[] => {
  const normalizedTarget = normalizeRepositoryPath(targetPath);
  if (!normalizedTarget) return [];
  const candidates = new Set<string>([normalizedTarget]);
  const fileName = normalizedTarget.split("/").pop() || normalizedTarget;
  if (!isXacroPath(fileName)) {
    return Array.from(candidates);
  }

  const directory = repositoryDirname(normalizedTarget);
  const prefix = directory ? `${directory}/` : "";
  const stem = fileName.replace(/(\.urdf)?\.xacro$/i, "");

  if (isUrdfXacroPath(fileName)) {
    candidates.add(`${prefix}${stem}.xacro`);
  } else {
    candidates.add(`${prefix}${stem}.urdf.xacro`);
  }

  return Array.from(candidates);
};

export const resolveRepositoryXacroTargetPath = <T extends RepositoryFileEntry>(
  files: T[],
  targetPath: string
): string => {
  const exactMatch = findRepositoryFileByPath(files, targetPath);
  if (exactMatch) return exactMatch.path;

  for (const candidatePath of buildRepositoryXacroTargetPathCandidates(targetPath)) {
    const candidate = findRepositoryFileByPath(files, candidatePath);
    if (candidate) {
      return candidate.path;
    }
  }

  return targetPath;
};

export const findRepositoryUrdfCandidates = <T extends RepositoryNamedFileEntry>(
  files: T[]
): RepositoryUrdfCandidate[] => {
  const candidateFiles = files.filter((file) => {
    if (file.type !== "file") return false;
    if (isIgnorableRepositoryMetadataFile(file)) return false;
    const lowered = file.name.toLowerCase();
    if (isSupportXacroFile(lowered)) return false;
    return lowered.endsWith(".urdf") || isXacroPath(lowered);
  });

  const candidates = candidateFiles.map((urdfFile) => {
    const urdfDir = repositoryDirname(urdfFile.path);
    const meshesFolderPath = findMeshesFolderForUrdf(files, urdfDir);

    return {
      path: urdfFile.path,
      name: urdfFile.name,
      displayName: buildRepositoryCandidateDisplayName(urdfFile.name),
      fileBase: buildRepositoryCandidateFileBase(urdfFile.path),
      sourceFile: urdfFile.name,
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

const parseXmlAttributes = (rawAttributes: string): Map<string, string> => {
  const attributes = new Map<string, string>();
  let match: RegExpExecArray | null;
  XML_ATTRIBUTE_REGEX.lastIndex = 0;
  while ((match = XML_ATTRIBUTE_REGEX.exec(rawAttributes))) {
    attributes.set(match[1], match[2] ?? match[3] ?? "");
  }
  return attributes;
};

export const extractXacroArgumentDefinitions = (
  xacroContent: string
): XacroArgumentDefinition[] => {
  if (!xacroContent.trim()) return [];

  const stripped = xacroContent.replace(XML_COMMENT_REGEX, "");
  const definitions: XacroArgumentDefinition[] = [];
  const seenNames = new Set<string>();
  let match: RegExpExecArray | null;
  XACRO_ARG_TAG_REGEX.lastIndex = 0;

  while ((match = XACRO_ARG_TAG_REGEX.exec(stripped))) {
    const attributes = parseXmlAttributes(match[1] ?? "");
    const name = (attributes.get("name") ?? "").trim();
    if (!name || seenNames.has(name)) continue;

    const hasDefault = attributes.has("default") || attributes.has("value");
    const defaultValue = attributes.has("default")
      ? (attributes.get("default") ?? "")
      : attributes.has("value")
        ? (attributes.get("value") ?? "")
        : null;

    seenNames.add(name);
    definitions.push({
      name,
      hasDefault,
      defaultValue,
      isRequired: !hasDefault,
    });
  }

  return definitions;
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
  const packageXmlPath = `${packageName.toLowerCase()}/package.xml`;
  const needle = `/${packageXmlPath}`;
  for (const file of files) {
    if (file.type !== "file") continue;
    const lowerPath = file.path.toLowerCase();
    if (lowerPath === packageXmlPath || lowerPath.endsWith(needle)) {
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

export const collectPackageResourceFilesForMatchedFiles = <T extends RepositoryFileEntry>(
  files: T[],
  matchedFiles: T[],
  packageRoots: Record<string, string[]> = buildPackageRootsFromRepositoryFiles(files)
): T[] => {
  const matchedPackageRoots = new Set<string>();

  matchedFiles.forEach((file) => {
    if (file.type !== "file") return;
    const normalizedPath = normalizeMeshPathForMatch(file.path);
    if (!normalizedPath) return;

    Object.values(packageRoots).forEach((roots) => {
      roots.forEach((root) => {
        const normalizedRoot = normalizeMeshPathForMatch(root);
        if (!normalizedRoot) return;
        if (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)) {
          matchedPackageRoots.add(normalizedRoot);
        }
      });
    });
  });

  if (matchedPackageRoots.size === 0) return [];

  return files.filter((file) => {
    if (file.type !== "file" || !isSupportedMeshResource(file.path)) return false;
    const normalizedPath = normalizeMeshPathForMatch(file.path);
    if (!normalizedPath) return false;
    for (const root of matchedPackageRoots) {
      if (normalizedPath === root || normalizedPath.startsWith(`${root}/`)) {
        return true;
      }
    }
    return false;
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

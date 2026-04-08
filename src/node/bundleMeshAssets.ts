import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeMeshPathForMatch, parseMeshReference } from "../mesh/meshPaths";
import { parseURDF, serializeURDF } from "../parsing/urdfParser";
import { extractPackageNameFromPackageXml } from "../repository/repositoryMeshResolution";

const WINDOWS_ABS_PATH = /^[A-Za-z]:[\\/]/;
const XACRO_FIND_PATTERN = /^\$\(find\s+([^)]+)\)(?:\/(.*))?$/;

type BundleMeshAssetsOptions = {
  urdfPath: string;
  urdfContent: string;
  outPath: string;
  extraSearchRoots?: string[];
};

type BundledMeshAsset = {
  original: string;
  rewritten: string;
  sourcePath: string;
  targetPath: string;
};

export type BundleMeshAssetsResult = {
  success: boolean;
  content: string;
  outPath: string;
  assetsRoot: string;
  copiedFiles: number;
  bundled: BundledMeshAsset[];
  unresolved: string[];
  error?: string;
};

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const isExternalReference = (value: string) =>
  value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");

const isAbsoluteFilesystemPath = (value: string) =>
  value.startsWith("/") || WINDOWS_ABS_PATH.test(value);

const fileExists = (candidatePath: string | null): candidatePath is string => {
  if (!candidatePath) return false;
  try {
    return fs.statSync(candidatePath).isFile();
  } catch {
    return false;
  }
};

const normalizeRelativePath = (value: string): string =>
  value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");

const sanitizeAssetRelativePath = (value: string): string => {
  const parts = normalizeRelativePath(value).split("/").filter(Boolean);
  const output: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") {
      continue;
    }
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }
  return output.join("/");
};

const maybePackageXmlPath = (dirPath: string): string | null => {
  const candidate = path.join(dirPath, "package.xml");
  return fileExists(candidate) ? candidate : null;
};

const findPackageRoot = (inputPath: string): string | null => {
  let currentDir = path.dirname(path.resolve(inputPath));
  while (true) {
    const packageXmlPath = maybePackageXmlPath(currentDir);
    if (packageXmlPath) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
};

const discoverPackageName = (packageRoot: string): string | null => {
  const packageXmlPath = path.join(packageRoot, "package.xml");
  if (!fileExists(packageXmlPath)) {
    return null;
  }
  return extractPackageNameFromPackageXml(fs.readFileSync(packageXmlPath, "utf8"));
};

const addPackageRoot = (
  packageRoots: Map<string, string[]>,
  aliasRoots: Map<string, string[]>,
  packageRoot: string | null
) => {
  if (!packageRoot) {
    return;
  }
  const packageName = discoverPackageName(packageRoot);
  if (!packageName) {
    return;
  }
  const existing = packageRoots.get(packageName) ?? [];
  if (!existing.includes(packageRoot)) {
    existing.push(packageRoot);
    packageRoots.set(packageName, existing);
  }
  addAliasRoot(aliasRoots, packageName, packageRoot);
};

const addAliasRoot = (
  aliasRoots: Map<string, string[]>,
  alias: string,
  rootPath: string
) => {
  const key = alias.trim();
  if (!key) {
    return;
  }
  const existing = aliasRoots.get(key) ?? [];
  if (!existing.includes(rootPath)) {
    existing.push(rootPath);
    aliasRoots.set(key, existing);
  }
};

const registerSearchPathAliases = (
  aliasRoots: Map<string, string[]>,
  searchPath: string
) => {
  let current = path.resolve(searchPath);
  if (fileExists(current)) {
    current = path.dirname(current);
  }

  while (true) {
    const basename = path.basename(current);
    if (basename) {
      addAliasRoot(aliasRoots, basename, current);
    }
    if (fs.existsSync(path.join(current, "meshes")) || fs.existsSync(path.join(current, "assets"))) {
      addAliasRoot(aliasRoots, basename, current);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
};

const resolveFilesystemCandidate = (baseDir: string, meshPath: string): string | null => {
  const normalized = normalizeMeshPathForMatch(meshPath);
  if (!normalized) return null;
  const segments = normalized.split("/").filter(Boolean);
  return path.resolve(baseDir, ...segments);
};

const addAliasCandidates = (
  addCandidate: (candidatePath: string | null) => void,
  aliasRoot: string,
  meshPath: string
) => {
  addCandidate(resolveFilesystemCandidate(aliasRoot, meshPath));

  try {
    for (const entry of fs.readdirSync(aliasRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      addCandidate(resolveFilesystemCandidate(path.join(aliasRoot, entry.name), meshPath));
    }
  } catch {
    // Ignore unreadable alias roots.
  }
};

const startsWithMeshFolder = (meshPath: string): boolean => {
  const lower = meshPath.toLowerCase();
  return (
    lower.startsWith("meshes/") ||
    lower.startsWith("meshes\\") ||
    lower.startsWith("assets/") ||
    lower.startsWith("assets\\")
  );
};

const buildResolutionCandidates = (
  urdfPath: string,
  meshRef: string,
  packageRoots: Map<string, string[]>,
  aliasRoots: Map<string, string[]>
): string[] => {
  const candidates: string[] = [];
  const addCandidate = (candidatePath: string | null) => {
    if (!candidatePath || candidates.includes(candidatePath)) {
      return;
    }
    candidates.push(candidatePath);
  };

  const urdfDir = path.dirname(path.resolve(urdfPath));
  const parentDir = path.dirname(urdfDir);
  const refInfo = parseMeshReference(meshRef);
  const rawPath = refInfo.path || refInfo.raw;
  const normalizedPath = normalizeMeshPathForMatch(rawPath);
  const xacroFindMatch = rawPath.match(XACRO_FIND_PATTERN);

  if (xacroFindMatch?.[1]) {
    const alias = xacroFindMatch[1].trim();
    const aliasPath = xacroFindMatch[2]?.trim() || "";
    for (const aliasRoot of aliasRoots.get(alias) ?? []) {
      addAliasCandidates(addCandidate, aliasRoot, aliasPath);
    }
    return candidates;
  }

  if (refInfo.scheme === "package" && refInfo.packageName) {
    for (const packageRoot of packageRoots.get(refInfo.packageName) ?? []) {
      addCandidate(resolveFilesystemCandidate(packageRoot, rawPath));
    }
    for (const aliasRoot of aliasRoots.get(refInfo.packageName) ?? []) {
      addAliasCandidates(addCandidate, aliasRoot, rawPath);
    }
    return candidates;
  }

  if (refInfo.scheme === "file") {
    if (isAbsoluteFilesystemPath(rawPath)) {
      addCandidate(path.resolve(rawPath));
    } else {
      addCandidate(resolveFilesystemCandidate(urdfDir, rawPath));
    }
    return candidates;
  }

  if (isAbsoluteFilesystemPath(meshRef)) {
    addCandidate(path.resolve(meshRef));
    return candidates;
  }

  addCandidate(resolveFilesystemCandidate(urdfDir, rawPath));

  if (normalizedPath) {
    if (startsWithMeshFolder(normalizedPath)) {
      addCandidate(resolveFilesystemCandidate(parentDir, normalizedPath));
      for (const roots of packageRoots.values()) {
        for (const packageRoot of roots) {
          addCandidate(resolveFilesystemCandidate(packageRoot, normalizedPath));
        }
      }
    }

    if (!normalizedPath.includes("/")) {
      for (const folderName of ["meshes", "assets"]) {
        addCandidate(resolveFilesystemCandidate(urdfDir, `${folderName}/${normalizedPath}`));
        addCandidate(resolveFilesystemCandidate(parentDir, `${folderName}/${normalizedPath}`));
        for (const roots of packageRoots.values()) {
          for (const packageRoot of roots) {
            addCandidate(resolveFilesystemCandidate(packageRoot, `${folderName}/${normalizedPath}`));
          }
        }
      }
    }
  }

  return candidates;
};

const resolveMeshPath = (
  urdfPath: string,
  meshRef: string,
  packageRoots: Map<string, string[]>,
  aliasRoots: Map<string, string[]>
): string | null =>
  buildResolutionCandidates(urdfPath, meshRef, packageRoots, aliasRoots).find((candidate) => fileExists(candidate)) ?? null;

const buildAssetRelativePath = (meshRef: string, resolvedPath: string): string => {
  const refInfo = parseMeshReference(meshRef);
  const basename = path.basename(resolvedPath);
  if (refInfo.scheme === "package" && refInfo.packageName) {
    const normalized = sanitizeAssetRelativePath(refInfo.path || basename);
    return sanitizeAssetRelativePath(`${refInfo.packageName}/${normalized || basename}`);
  }

  if (refInfo.scheme === "file" && refInfo.isAbsoluteFile) {
    return sanitizeAssetRelativePath(`external/${basename}`);
  }

  const normalized = sanitizeAssetRelativePath(normalizeMeshPathForMatch(refInfo.path || refInfo.raw || ""));
  if (!normalized) {
    return basename;
  }
  if (normalized.startsWith("assets/")) {
    return sanitizeAssetRelativePath(normalized.slice("assets/".length)) || basename;
  }
  return normalized;
};

const uniquifyAssetPath = (
  desiredRelativePath: string,
  sourcePath: string,
  assignedTargets: Map<string, string>
): string => {
  const normalized = desiredRelativePath || path.basename(sourcePath);
  const existingSource = assignedTargets.get(normalized);
  if (!existingSource || existingSource === sourcePath) {
    assignedTargets.set(normalized, sourcePath);
    return normalized;
  }

  const extension = path.extname(normalized);
  const stem = extension ? normalized.slice(0, -extension.length) : normalized;
  let index = 2;
  while (true) {
    const candidate = `${stem}-${index}${extension}`;
    const candidateSource = assignedTargets.get(candidate);
    if (!candidateSource || candidateSource === sourcePath) {
      assignedTargets.set(candidate, sourcePath);
      return candidate;
    }
    index += 1;
  }
};

export const bundleMeshAssetsForUrdfFile = ({
  urdfPath,
  urdfContent,
  outPath,
  extraSearchRoots = [],
}: BundleMeshAssetsOptions): BundleMeshAssetsResult => {
  if (!urdfContent.trim()) {
    return {
      success: false,
      content: urdfContent,
      outPath,
      assetsRoot: path.join(path.dirname(outPath), "assets"),
      copiedFiles: 0,
      bundled: [],
      unresolved: [],
      error: "Empty URDF",
    };
  }

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return {
      success: false,
      content: urdfContent,
      outPath,
      assetsRoot: path.join(path.dirname(outPath), "assets"),
      copiedFiles: 0,
      bundled: [],
      unresolved: [],
      error: parsed.error ?? "Invalid URDF",
    };
  }

  const assetsRoot = path.join(path.dirname(path.resolve(outPath)), "assets");
  const packageRoots = new Map<string, string[]>();
  const aliasRoots = new Map<string, string[]>();
  registerSearchPathAliases(aliasRoots, urdfPath);
  addPackageRoot(packageRoots, aliasRoots, findPackageRoot(urdfPath));
  for (const extraRoot of extraSearchRoots) {
    registerSearchPathAliases(aliasRoots, extraRoot);
    addPackageRoot(packageRoots, aliasRoots, findPackageRoot(extraRoot) ?? path.resolve(extraRoot));
  }

  const bundled: BundledMeshAsset[] = [];
  const unresolved: string[] = [];
  const copiedSourceToTarget = new Map<string, string>();
  const assignedTargets = new Map<string, string>();

  for (const mesh of Array.from(parsed.document.querySelectorAll("mesh"))) {
    const filename = mesh.getAttribute("filename")?.trim();
    if (!filename || isExternalReference(filename)) {
      continue;
    }

    const resolvedPath = resolveMeshPath(urdfPath, filename, packageRoots, aliasRoots);
    if (!resolvedPath) {
      unresolved.push(filename);
      continue;
    }

    const desiredRelativePath = buildAssetRelativePath(filename, resolvedPath);
    const assetRelativePath = uniquifyAssetPath(desiredRelativePath, resolvedPath, assignedTargets);
    const targetPath =
      copiedSourceToTarget.get(resolvedPath) ?? path.join(assetsRoot, assetRelativePath);

    if (!copiedSourceToTarget.has(resolvedPath)) {
      ensureDir(path.dirname(targetPath));
      fs.copyFileSync(resolvedPath, targetPath);
      copiedSourceToTarget.set(resolvedPath, targetPath);
    }

    const rewritten = `assets/${normalizeRelativePath(path.relative(assetsRoot, targetPath))}`;
    mesh.setAttribute("filename", rewritten);
    bundled.push({
      original: filename,
      rewritten,
      sourcePath: resolvedPath,
      targetPath,
    });
  }

  return {
    success: unresolved.length === 0,
    content: serializeURDF(parsed.document),
    outPath,
    assetsRoot,
    copiedFiles: copiedSourceToTarget.size,
    bundled,
    unresolved,
    error: unresolved.length > 0 ? "Some mesh references could not be bundled." : undefined,
  };
};

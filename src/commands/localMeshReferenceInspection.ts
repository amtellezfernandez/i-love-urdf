import * as fs from "node:fs";
import * as path from "node:path";
import { type PathCorrection } from "../mesh/fixMeshPaths";
import { normalizeMeshPathForMatch, parseMeshReference } from "../mesh/meshPaths";
import { parseURDF, serializeURDF } from "../parsing/urdfParser";
import { extractPackageNameFromPackageXml } from "../repository/repositoryMeshResolution";
import { parseXml } from "../xmlDom";

const WINDOWS_ABS_PATH = /^[A-Za-z]:[\\/]/;

type LocalPackageContext = {
  packageName: string | null;
  packageRoot: string | null;
  packageXmlPath: string | null;
};

export type LocalMeshReferenceStatus = "resolvable" | "unresolved" | "external";

export type LocalMeshReferenceInspection = ReturnType<typeof parseMeshReference> & {
  status: LocalMeshReferenceStatus;
  element: "visual" | "collision" | "unknown";
  linkName?: string;
  resolvedPath: string | null;
  normalizedReference: string | null;
  needsNormalization: boolean;
};

export type LocalMeshReferenceReport = {
  count: number;
  packageName: string | null;
  packageRoot: string | null;
  packageXmlPath: string | null;
  detectedMeshFolders: string[];
  summary: {
    resolvable: number;
    unresolved: number;
    external: number;
    normalizable: number;
  };
  refs: LocalMeshReferenceInspection[];
};

export type FixLocalMeshPathsResult = {
  urdfContent: string;
  corrections: PathCorrection[];
  unresolved: string[];
  packageName: string;
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

const resolveFilesystemCandidate = (baseDir: string, meshPath: string): string | null => {
  const normalized = normalizeMeshPathForMatch(meshPath);
  if (!normalized) return null;
  const segments = normalized.split("/").filter(Boolean);
  return path.resolve(baseDir, ...segments);
};

const maybePackageXmlPath = (dirPath: string): string | null => {
  const candidate = path.join(dirPath, "package.xml");
  return fileExists(candidate) ? candidate : null;
};

export const discoverLocalPackageContext = (
  urdfPath: string,
  explicitPackageName?: string
): LocalPackageContext => {
  let currentDir = path.dirname(path.resolve(urdfPath));
  while (true) {
    const packageXmlPath = maybePackageXmlPath(currentDir);
    if (packageXmlPath) {
      const packageXml = fs.readFileSync(packageXmlPath, "utf8");
      return {
        packageName: explicitPackageName ?? extractPackageNameFromPackageXml(packageXml),
        packageRoot: currentDir,
        packageXmlPath,
      };
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return {
    packageName: explicitPackageName ?? null,
    packageRoot: null,
    packageXmlPath: null,
  };
};

const findLinkContext = (
  element: Element
): { linkName?: string; element: "visual" | "collision" | "unknown" } => {
  let current: Element | null = element;
  let elementType: "visual" | "collision" | "unknown" = "unknown";
  while (current) {
    const tagName = current.tagName?.toLowerCase();
    if (tagName === "visual" || tagName === "collision") {
      elementType = tagName;
    }
    if (tagName === "link") {
      return {
        linkName: current.getAttribute("name") ?? undefined,
        element: elementType,
      };
    }
    current = current.parentElement;
  }
  return { element: elementType };
};

const isWithinDirectory = (rootDir: string, candidatePath: string): boolean => {
  const relativePath = path.relative(rootDir, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

const buildPackageReference = (packageName: string, meshPath: string): string => {
  const normalized = normalizeMeshPathForMatch(meshPath);
  return normalized ? `package://${packageName}/${normalized}` : `package://${packageName}`;
};

const buildPackageReferenceFromResolvedPath = (
  candidatePath: string,
  packageContext: LocalPackageContext
): string | null => {
  if (!packageContext.packageName || !packageContext.packageRoot) {
    return null;
  }
  if (!isWithinDirectory(packageContext.packageRoot, candidatePath)) {
    return null;
  }
  const relativePath = path.relative(packageContext.packageRoot, candidatePath).split(path.sep).join("/");
  return buildPackageReference(packageContext.packageName, relativePath);
};

const normalizeFileReference = (candidatePath: string): string =>
  `file://${candidatePath.replace(/\\/g, "/")}`;

const startsWithMeshFolder = (meshPath: string): boolean => {
  const lower = meshPath.toLowerCase();
  return (
    lower.startsWith("meshes/") ||
    lower.startsWith("meshes\\") ||
    lower.startsWith("assets/") ||
    lower.startsWith("assets\\")
  );
};

const buildLocalResolutionCandidates = (
  urdfPath: string,
  meshRef: string,
  packageContext: LocalPackageContext
): string[] => {
  const candidates: string[] = [];
  const addCandidate = (candidatePath: string | null) => {
    if (!candidatePath) return;
    if (!candidates.includes(candidatePath)) {
      candidates.push(candidatePath);
    }
  };

  const urdfDir = path.dirname(path.resolve(urdfPath));
  const parentDir = path.dirname(urdfDir);
  const refInfo = parseMeshReference(meshRef);
  const rawPath = refInfo.path || refInfo.raw;

  if (refInfo.scheme === "package") {
    const samePackage =
      packageContext.packageName &&
      refInfo.packageName &&
      refInfo.packageName.toLowerCase() === packageContext.packageName.toLowerCase();
    if (samePackage && packageContext.packageRoot) {
      addCandidate(resolveFilesystemCandidate(packageContext.packageRoot, rawPath));
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

  const normalizedPath = normalizeMeshPathForMatch(rawPath);
  addCandidate(resolveFilesystemCandidate(urdfDir, rawPath));

  if (normalizedPath) {
    if (startsWithMeshFolder(normalizedPath)) {
      addCandidate(resolveFilesystemCandidate(parentDir, normalizedPath));
      if (packageContext.packageRoot) {
        addCandidate(resolveFilesystemCandidate(packageContext.packageRoot, normalizedPath));
      }
    }

    if (!normalizedPath.includes("/")) {
      for (const folderName of ["meshes", "assets"]) {
        addCandidate(resolveFilesystemCandidate(urdfDir, `${folderName}/${normalizedPath}`));
        addCandidate(resolveFilesystemCandidate(parentDir, `${folderName}/${normalizedPath}`));
        if (packageContext.packageRoot) {
          addCandidate(resolveFilesystemCandidate(packageContext.packageRoot, `${folderName}/${normalizedPath}`));
        }
      }
    }
  }

  return candidates;
};

const resolveLocalMeshPath = (
  urdfPath: string,
  meshRef: string,
  packageContext: LocalPackageContext
): string | null =>
  buildLocalResolutionCandidates(urdfPath, meshRef, packageContext).find((candidatePath) => fileExists(candidatePath)) ??
  null;

const getDetectedMeshFolder = (
  normalizedReference: string | null,
  resolvedPath: string | null,
  packageContext: LocalPackageContext
): string | null => {
  const rawPath = normalizedReference ?? "";
  let candidate = rawPath;
  if (candidate.startsWith("package://")) {
    const match = candidate.match(/^package:\/\/[^/]+\/?(.*)$/);
    candidate = match?.[1] ?? "";
  } else if (candidate.startsWith("file://")) {
    candidate = candidate.slice("file://".length);
  }

  let normalized = normalizeMeshPathForMatch(candidate);
  if (!normalized && resolvedPath && packageContext.packageRoot && isWithinDirectory(packageContext.packageRoot, resolvedPath)) {
    normalized = path.relative(packageContext.packageRoot, resolvedPath).split(path.sep).join("/");
  }
  if (!normalized) {
    return null;
  }

  const parts = normalized.split("/").filter(Boolean);
  while (parts[0] === "..") {
    parts.shift();
  }
  const firstPart = parts[0]?.toLowerCase() ?? "";
  return firstPart === "meshes" || firstPart === "assets" ? firstPart : null;
};

const inspectLocalMeshReference = (
  filename: string,
  urdfPath: string,
  packageContext: LocalPackageContext,
  context: { linkName?: string; element: "visual" | "collision" | "unknown" }
): LocalMeshReferenceInspection => {
  const refInfo = parseMeshReference(filename);
  if (isExternalReference(filename)) {
    return {
      ...refInfo,
      ...context,
      status: "external",
      resolvedPath: null,
      normalizedReference: filename,
      needsNormalization: false,
    };
  }

  const rawPath = refInfo.path || refInfo.raw;
  const normalizedPath = normalizeMeshPathForMatch(rawPath);
  const resolvedPath = resolveLocalMeshPath(urdfPath, filename, packageContext);
  const packageReferenceFromResolvedPath = resolvedPath
    ? buildPackageReferenceFromResolvedPath(resolvedPath, packageContext)
    : null;

  let normalizedReference = filename;
  if (packageReferenceFromResolvedPath) {
    normalizedReference = packageReferenceFromResolvedPath;
  } else if (refInfo.scheme === "package" && refInfo.packageName) {
    const normalizedPackageName =
      packageContext.packageName &&
      refInfo.packageName.toLowerCase() === packageContext.packageName.toLowerCase()
        ? packageContext.packageName
        : refInfo.packageName;
    normalizedReference = buildPackageReference(normalizedPackageName, normalizedPath ?? "");
  } else if (refInfo.scheme === "file") {
    normalizedReference = resolvedPath ? normalizeFileReference(resolvedPath) : normalizeFileReference(rawPath);
  } else if (isAbsoluteFilesystemPath(filename)) {
    normalizedReference = resolvedPath ? normalizeFileReference(resolvedPath) : normalizeFileReference(filename);
  } else if (normalizedPath) {
    normalizedReference = normalizedPath;
  }

  return {
    ...refInfo,
    ...context,
    status: resolvedPath ? "resolvable" : "unresolved",
    resolvedPath,
    normalizedReference,
    needsNormalization: normalizedReference !== filename,
  };
};

export const inspectLocalMeshReferences = (
  urdfPath: string,
  urdfContent: string,
  options: { packageName?: string } = {}
): LocalMeshReferenceReport => {
  const doc = parseXml(urdfContent);
  const packageContext = discoverLocalPackageContext(urdfPath, options.packageName);
  const detectedMeshFolders = new Set<string>();
  const refs = Array.from(doc.querySelectorAll("mesh"))
    .map((meshElement) => {
      const filename = meshElement.getAttribute("filename")?.trim();
      if (!filename) {
        return null;
      }
      const context = findLinkContext(meshElement);
      const inspection = inspectLocalMeshReference(filename, urdfPath, packageContext, context);
      const detectedMeshFolder = getDetectedMeshFolder(
        inspection.normalizedReference,
        inspection.resolvedPath,
        packageContext
      );
      if (detectedMeshFolder) {
        detectedMeshFolders.add(detectedMeshFolder);
      }
      return inspection;
    })
    .filter((inspection): inspection is LocalMeshReferenceInspection => Boolean(inspection));

  return {
    count: refs.length,
    packageName: packageContext.packageName,
    packageRoot: packageContext.packageRoot,
    packageXmlPath: packageContext.packageXmlPath,
    detectedMeshFolders: Array.from(detectedMeshFolders),
    summary: {
      resolvable: refs.filter((ref) => ref.status === "resolvable").length,
      unresolved: refs.filter((ref) => ref.status === "unresolved").length,
      external: refs.filter((ref) => ref.status === "external").length,
      normalizable: refs.filter((ref) => ref.needsNormalization).length,
    },
    refs,
  };
};

export const fixLocalMeshPaths = (
  urdfPath: string,
  urdfContent: string,
  options: { packageName?: string } = {}
): FixLocalMeshPathsResult => {
  const parsed = parseURDF(urdfContent);
  const packageContext = discoverLocalPackageContext(urdfPath, options.packageName);
  const result: FixLocalMeshPathsResult = {
    urdfContent,
    corrections: [],
    unresolved: [],
    packageName: packageContext.packageName ?? "",
  };
  if (!parsed.isValid) {
    return result;
  }

  const meshElements = Array.from(parsed.document.querySelectorAll("mesh"));
  meshElements.forEach((meshElement) => {
    const filename = meshElement.getAttribute("filename")?.trim();
    if (!filename) {
      return;
    }

    const context = findLinkContext(meshElement);
    const inspection = inspectLocalMeshReference(filename, urdfPath, packageContext, context);
    if (inspection.status === "unresolved") {
      result.unresolved.push(filename);
    }
    if (!inspection.needsNormalization || !inspection.normalizedReference) {
      return;
    }

    let reason = "Normalized mesh path";
    if (inspection.normalizedReference.startsWith("package://") && !filename.startsWith("package://")) {
      reason = "Converted resolvable mesh path to package:// format";
    } else if (filename.startsWith("package://")) {
      reason = "Normalized package:// URI path";
    } else if (filename.startsWith("file://") || isAbsoluteFilesystemPath(filename)) {
      reason = "Normalized file-based mesh path";
    } else if (filename.includes("\\")) {
      reason = "Fixed Windows-style backslashes";
    } else if (filename.includes("/../") || filename.includes("/./")) {
      reason = "Normalized path segments (removed .. and .)";
    }

    meshElement.setAttribute("filename", inspection.normalizedReference);
    result.corrections.push({
      element: context.element,
      linkName: context.linkName ?? "unknown",
      original: filename,
      corrected: inspection.normalizedReference,
      reason,
    });
  });

  if (result.corrections.length > 0) {
    result.urdfContent = serializeURDF(parsed.document);
  }

  return result;
};

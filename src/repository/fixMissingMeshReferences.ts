import { parseURDF, serializeURDF } from "../parsing/urdfParser";
import { SUPPORTED_MESH_EXTENSIONS } from "../mesh/meshFormats";
import { normalizeMeshPathForMatch, parseMeshReference } from "../mesh/meshPaths";
import {
  buildPackageRootsFromRepositoryFiles,
  normalizeRepositoryPath,
  repositoryDirname,
  resolveRepositoryFileReference,
  type RepositoryFileEntry,
} from "./repositoryMeshResolution";

export type MeshReferenceCorrection = {
  original: string;
  corrected: string;
  linkName?: string;
  element?: "visual" | "collision" | "unknown";
  reason: string;
};

export type FixMissingMeshReferencesResult = {
  success: boolean;
  content: string;
  corrections: MeshReferenceCorrection[];
  unresolved: string[];
  error?: string;
};

export type FixMissingMeshReferencesOptions = {
  packageRoots?: Record<string, string[]>;
};

const isExternalReference = (value: string) =>
  value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");

const getMeshDirOverride = (doc: Document): string => {
  const compiler = doc.querySelector("robot > compiler");
  const meshDir = compiler?.getAttribute("meshdir")?.trim();
  if (!meshDir) return "";
  return normalizeMeshPathForMatch(meshDir);
};

const findLinkContext = (element: Element) => {
  let current: Element | null = element;
  let elementType: "visual" | "collision" | "unknown" = "unknown";
  while (current) {
    const tag = current.tagName?.toLowerCase();
    if (tag === "visual" || tag === "collision") {
      elementType = tag;
    }
    if (tag === "link") {
      return {
        linkName: current.getAttribute("name") ?? undefined,
        element: elementType,
      };
    }
    current = current.parentElement;
  }
  return { element: elementType };
};

const makeRelativePath = (fromDir: string, toPath: string): string => {
  const from = normalizeRepositoryPath(fromDir);
  const to = normalizeRepositoryPath(toPath);
  if (!from) return to;
  const fromParts = from.split("/").filter(Boolean);
  const toParts = to.split("/").filter(Boolean);
  let common = 0;
  while (common < fromParts.length && common < toParts.length) {
    if (fromParts[common] !== toParts[common]) break;
    common += 1;
  }
  const ups = fromParts.length - common;
  const down = toParts.slice(common).join("/");
  const prefix = ups > 0 ? Array.from({ length: ups }, () => "..").join("/") : "";
  if (!prefix) return down;
  if (!down) return prefix;
  return `${prefix}/${down}`;
};

const findPackageReferenceForPath = (
  resolvedPath: string,
  packageRoots: Record<string, string[]>,
  preferredPackage?: string
): string | null => {
  const normalized = normalizeRepositoryPath(resolvedPath);
  if (!normalized) return null;

  let best: { pkg: string; root: string } | null = null;
  const consider = (pkg: string, root: string) => {
    const normalizedRoot = normalizeRepositoryPath(root);
    if (!normalizedRoot) return;
    if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
      if (!best || normalizedRoot.length > best.root.length) {
        best = { pkg, root: normalizedRoot };
      }
    }
  };

  if (preferredPackage && packageRoots[preferredPackage]) {
    packageRoots[preferredPackage].forEach((root) => consider(preferredPackage, root));
    if (best) {
      const rel = normalized.slice(best.root.length).replace(/^\/+/, "");
      return rel ? `package://${best.pkg}/${rel}` : `package://${best.pkg}`;
    }
  }

  Object.entries(packageRoots).forEach(([pkg, roots]) => {
    roots.forEach((root) => consider(pkg, root));
  });

  if (!best) return null;
  const relative = normalized.slice(best.root.length).replace(/^\/+/, "");
  return relative ? `package://${best.pkg}/${relative}` : `package://${best.pkg}`;
};

const buildExtensionCandidates = (value: string): string[] => {
  const normalized = normalizeMeshPathForMatch(value);
  if (!normalized) return [];
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return [];
  const filename = parts.pop() ?? normalized;
  const match = filename.match(/^(.*?)(\.[^.]+)?$/);
  const base = match?.[1] ?? filename;
  const dir = parts.join("/");
  return SUPPORTED_MESH_EXTENSIONS.map((ext) => (dir ? `${dir}/${base}${ext}` : `${base}${ext}`));
};

export const fixMissingMeshReferencesInRepository = <T extends RepositoryFileEntry>(
  urdfContent: string,
  urdfPath: string,
  files: T[],
  options: FixMissingMeshReferencesOptions = {}
): FixMissingMeshReferencesResult => {
  if (!urdfContent.trim()) {
    return {
      success: false,
      content: urdfContent,
      corrections: [],
      unresolved: [],
      error: "Empty URDF",
    };
  }

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return {
      success: false,
      content: urdfContent,
      corrections: [],
      unresolved: [],
      error: parsed.error ?? "Invalid URDF",
    };
  }

  const packageRoots =
    options.packageRoots ?? buildPackageRootsFromRepositoryFiles(files);
  const doc = parsed.document;
  const meshDirOverride = getMeshDirOverride(doc);
  const urdfDir = repositoryDirname(urdfPath);
  const corrections: MeshReferenceCorrection[] = [];
  const unresolved: string[] = [];

  const meshElements = Array.from(doc.querySelectorAll("mesh"));
  meshElements.forEach((mesh) => {
    const filename = mesh.getAttribute("filename")?.trim();
    if (!filename) return;
    if (isExternalReference(filename)) return;

    const existing = resolveRepositoryFileReference(urdfPath, filename, files, {
      packageRoots,
      meshDirOverride,
    });
    if (existing) return;

    const refInfo = parseMeshReference(filename);
    const rawPath = refInfo.path || refInfo.raw;
    const normalizedPath = normalizeMeshPathForMatch(rawPath);

    const candidates: string[] = [];
    const addCandidate = (candidate: string) => {
      if (!candidate) return;
      if (!candidates.includes(candidate)) candidates.push(candidate);
    };

    if (refInfo.scheme === "package" && refInfo.packageName) {
      addCandidate(`package://${refInfo.packageName}/${normalizedPath || rawPath}`);
    }

    if (meshDirOverride && normalizedPath && !normalizedPath.includes("/")) {
      addCandidate(`${meshDirOverride}/${normalizedPath}`);
      if (urdfDir) {
        addCandidate(`../${meshDirOverride}/${normalizedPath}`);
      }
    }

    addCandidate(normalizedPath || rawPath);
    if (normalizedPath) {
      if (urdfDir && (normalizedPath.startsWith("meshes/") || normalizedPath.startsWith("assets/"))) {
        addCandidate(`../${normalizedPath}`);
      }

      if (!normalizedPath.includes("/")) {
        addCandidate(`meshes/${normalizedPath}`);
        addCandidate(`assets/${normalizedPath}`);
        if (urdfDir) {
          addCandidate(`../meshes/${normalizedPath}`);
          addCandidate(`../assets/${normalizedPath}`);
        }
      }

      buildExtensionCandidates(normalizedPath).forEach(addCandidate);
    }

    const resolvedFile = candidates
      .map((candidate) =>
        resolveRepositoryFileReference(urdfPath, candidate, files, {
          packageRoots,
          meshDirOverride,
        })
      )
      .find((file): file is T => Boolean(file));

    if (!resolvedFile) {
      unresolved.push(filename);
      return;
    }

    const resolvedPath = normalizeRepositoryPath(resolvedFile.path);
    if (!resolvedPath) {
      unresolved.push(filename);
      return;
    }

    const preferredPackage = refInfo.scheme === "package" ? refInfo.packageName : undefined;
    const packageRef = findPackageReferenceForPath(
      resolvedPath,
      packageRoots,
      preferredPackage
    );

    let corrected = packageRef;
    const reason = packageRef ? "Resolved to package root" : "Resolved to relative path";
    if (!corrected) {
      corrected = urdfDir ? makeRelativePath(urdfDir, resolvedPath) : resolvedPath;
    }

    if (!corrected || corrected === filename) {
      return;
    }

    mesh.setAttribute("filename", corrected);
    const context = findLinkContext(mesh);
    corrections.push({
      original: filename,
      corrected,
      linkName: context.linkName,
      element: context.element,
      reason,
    });
  });

  if (corrections.length === 0) {
    return {
      success: true,
      content: urdfContent,
      corrections: [],
      unresolved,
    };
  }

  return {
    success: true,
    content: serializeURDF(doc),
    corrections,
    unresolved,
  };
};

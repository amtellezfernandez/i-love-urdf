const traversalPattern = /(^|[\\/])\.\.([\\/]|$)/;

export const isSafeMeshPath = (path: string): boolean => {
  if (!path) return false;
  if (traversalPattern.test(path)) return false;
  return true;
};

export const normalizeMeshPath = (path: string): string => path.trim();

export type MeshReference = {
  raw: string;
  scheme: "package" | "file" | null;
  packageName?: string;
  path: string;
  isAbsoluteFile: boolean;
};

export type PackagePathMap =
  | ReadonlyMap<string, string | null | undefined>
  | Record<string, string | null | undefined>;

const WINDOWS_ABS_PATH = /^[A-Za-z]:[\\/]/;

export const parseMeshReference = (ref: string): MeshReference => {
  const raw = ref.trim();
  if (raw.startsWith("package://")) {
    const match = raw.match(/^package:\/\/([^/]+)\/?(.*)$/);
    return {
      raw,
      scheme: "package",
      packageName: match?.[1],
      path: match?.[2] || "",
      isAbsoluteFile: false,
    };
  }
  if (raw.startsWith("file://")) {
    const path = raw.slice("file://".length);
    const isAbsoluteFile = path.startsWith("/") || WINDOWS_ABS_PATH.test(path);
    return { raw, scheme: "file", path, isAbsoluteFile };
  }
  return { raw, scheme: null, path: raw, isAbsoluteFile: false };
};

const collapsePathSegments = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === ".") {
      continue;
    }
    if (part === "..") {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== "..") {
        resolved.pop();
      } else {
        resolved.push("..");
      }
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
};

export const normalizeMeshPathForMatch = (path: string): string => {
  const cleaned = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return collapsePathSegments(cleaned);
};

const getPackageRoot = (
  packageMap: PackagePathMap,
  packageName: string
): string | null => {
  if (packageMap instanceof Map) {
    return packageMap.get(packageName)?.trim() || null;
  }
  return packageMap[packageName]?.trim() || null;
};

export const resolvePackagePaths = (
  ref: string,
  packageMap: PackagePathMap
): string | null => {
  const refInfo = parseMeshReference(ref);
  if (refInfo.scheme === "package") {
    if (!refInfo.packageName) return null;
    const packageRoot = getPackageRoot(packageMap, refInfo.packageName);
    if (!packageRoot) return null;
    const normalizedRoot = packageRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPath = normalizeMeshPathForMatch(refInfo.path);
    return normalizedPath ? `${normalizedRoot}/${normalizedPath}` : normalizedRoot;
  }
  if (refInfo.scheme === "file") {
    return refInfo.path.replace(/\\/g, "/");
  }
  const normalized = normalizeMeshPathForMatch(refInfo.path || refInfo.raw);
  return normalized || null;
};

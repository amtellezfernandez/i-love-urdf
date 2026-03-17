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

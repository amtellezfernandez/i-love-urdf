import * as xacroConfig from "./xacroContract.constants.json";

type XacroContractConfig = {
  supportExtensions?: string[];
  defaultArgs?: Record<string, string>;
};

const defaults = xacroConfig as XacroContractConfig;

export const XACRO_EXPAND_EMPTY_URDF_ERROR = "xacro produced empty output.";
const DEFAULT_XACRO_ARGS: Record<string, string> = { ...(defaults.defaultArgs ?? {}) };

export const XACRO_SUPPORT_EXTENSIONS = Object.freeze([...(defaults.supportExtensions ?? [])]);

export type XacroFilePayload = {
  path: string;
  content_base64: string;
};

export type XacroExpandRequestPayload = {
  target_path: string;
  files: XacroFilePayload[];
  args: Record<string, string>;
  use_inorder: boolean;
};

export type XacroExpandResponsePayload = {
  urdf?: string;
  stderr?: string | null;
  detail?: string;
};

const encodeBase64FromBytes = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  throw new Error("No base64 encoder is available in this runtime.");
};

const toUtf8Bytes = (content: string): Uint8Array => new TextEncoder().encode(content);

export const isXacroSupportPath = (path: string): boolean => {
  const lowered = path.toLowerCase();
  if (lowered.endsWith("package.xml")) return true;
  return XACRO_SUPPORT_EXTENSIONS.some((ext) => lowered.endsWith(ext));
};

export const isXacroPath = (path: string): boolean => path.toLowerCase().endsWith(".xacro");
export const isUrdfXacroPath = (path: string): boolean => path.toLowerCase().endsWith(".urdf.xacro");

export const normalizeExpandedUrdfPath = (path: string): string => {
  const cleaned = path.replace(/\\/g, "/");
  const withoutXacro = cleaned.replace(/\.xacro$/i, "");
  if (withoutXacro.toLowerCase().endsWith(".urdf")) {
    return withoutXacro;
  }
  return `${withoutXacro}.urdf`;
};

const stripXacroSuffix = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.replace(/(\.urdf)?\.xacro$/i, "");
};

export const buildXacroFilenameCandidates = (fileName: string): string[] => {
  const baseName = fileName.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
  if (!baseName) return [];

  if (isUrdfXacroPath(baseName)) {
    return [baseName, baseName.replace(/\.urdf\.xacro$/i, ".xacro")];
  }
  if (isXacroPath(baseName)) {
    return [baseName];
  }

  const stem = stripXacroSuffix(baseName).replace(/\.urdf$/i, "");
  const candidates = [`${stem}.xacro`, `${baseName}.xacro`];
  return Array.from(new Set(candidates.filter((item) => item.length > 0)));
};

export const createXacroFilePayloadFromBytes = (path: string, bytes: Uint8Array): XacroFilePayload => ({
  path,
  content_base64: encodeBase64FromBytes(bytes),
});

export const createXacroFilePayloadFromText = (path: string, content: string): XacroFilePayload =>
  createXacroFilePayloadFromBytes(path, toUtf8Bytes(content));

export const buildXacroExpandRequestPayload = ({
  targetPath,
  files,
  args,
  useInorder = true,
}: {
  targetPath: string;
  files: XacroFilePayload[];
  args?: Record<string, string>;
  useInorder?: boolean;
}): XacroExpandRequestPayload => ({
  target_path: targetPath,
  files,
  args: args ?? DEFAULT_XACRO_ARGS,
  use_inorder: useInorder,
});

export const parseXacroExpandResponsePayload = (
  payload: XacroExpandResponsePayload,
  emptyUrdfErrorMessage: string = XACRO_EXPAND_EMPTY_URDF_ERROR
): { urdf: string; stderr?: string | null } => {
  if (!payload?.urdf || payload.urdf.trim().length === 0) {
    throw new Error(emptyUrdfErrorMessage);
  }
  return {
    urdf: payload.urdf,
    stderr: payload.stderr ?? null,
  };
};

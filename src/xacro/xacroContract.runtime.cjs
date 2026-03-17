const config = require("./xacroContract.constants.json");

const XACRO_EXPAND_EMPTY_URDF_ERROR = "xacro produced empty output.";
const DEFAULT_XACRO_ARGS = Object.freeze({ ...(config.defaultArgs || {}) });
const XACRO_SUPPORT_EXTENSIONS = Object.freeze([...(config.supportExtensions || [])]);

const isXacroSupportPath = (path) => {
  const lowered = String(path || "").toLowerCase();
  if (lowered.endsWith("package.xml")) return true;
  return XACRO_SUPPORT_EXTENSIONS.some((ext) => lowered.endsWith(ext));
};

const isXacroPath = (path) => String(path || "").toLowerCase().endsWith(".xacro");
const isUrdfXacroPath = (path) => String(path || "").toLowerCase().endsWith(".urdf.xacro");

const normalizeExpandedUrdfPath = (path) => {
  const cleaned = String(path || "").replace(/\\/g, "/");
  const withoutXacro = cleaned.replace(/\.xacro$/i, "");
  if (withoutXacro.toLowerCase().endsWith(".urdf")) {
    return withoutXacro;
  }
  return `${withoutXacro}.urdf`;
};

const stripXacroSuffix = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.replace(/(\.urdf)?\.xacro$/i, "");
};

const buildXacroFilenameCandidates = (fileName) => {
  const baseName = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.toLowerCase();
  if (!baseName) return [];

  if (isUrdfXacroPath(baseName)) {
    return [baseName, baseName.replace(/\.urdf\.xacro$/i, ".xacro")];
  }
  if (isXacroPath(baseName)) {
    return [baseName];
  }

  const stem = stripXacroSuffix(baseName).replace(/\.urdf$/i, "");
  const candidates = [`${stem}.xacro`, `${baseName}.xacro`];
  return Array.from(new Set(candidates.filter(Boolean)));
};

const createXacroFilePayloadFromBytes = (path, bytes) => ({
  path,
  content_base64: Buffer.from(bytes).toString("base64"),
});

const createXacroFilePayloadFromText = (path, content) =>
  createXacroFilePayloadFromBytes(path, Buffer.from(String(content || ""), "utf8"));

const buildXacroExpandRequestPayload = ({ targetPath, files, args, useInorder = true }) => ({
  target_path: targetPath,
  files,
  args: args ?? DEFAULT_XACRO_ARGS,
  use_inorder: useInorder,
});

const parseXacroExpandResponsePayload = (
  payload,
  emptyUrdfErrorMessage = XACRO_EXPAND_EMPTY_URDF_ERROR
) => {
  const urdf = String(payload?.urdf || "");
  if (!urdf.trim()) {
    throw new Error(emptyUrdfErrorMessage);
  }
  return {
    urdf,
    stderr: payload?.stderr ?? null,
  };
};

module.exports = {
  XACRO_SUPPORT_EXTENSIONS,
  XACRO_EXPAND_EMPTY_URDF_ERROR,
  isXacroSupportPath,
  isXacroPath,
  isUrdfXacroPath,
  normalizeExpandedUrdfPath,
  buildXacroFilenameCandidates,
  createXacroFilePayloadFromBytes,
  createXacroFilePayloadFromText,
  buildXacroExpandRequestPayload,
  parseXacroExpandResponsePayload,
};

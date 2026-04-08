const config = require("./xacroContract.constants.json");

const XACRO_EXPAND_EMPTY_URDF_ERROR = "xacro produced empty output.";
const DEFAULT_XACRO_ARGS = Object.freeze({ ...(config.defaultArgs || {}) });
const XACRO_SUPPORT_EXTENSIONS = Object.freeze([...(config.supportExtensions || [])]);
const normalizeXacroPayloadPath = (path) => String(path || "").replace(/\\/g, "/");

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

const buildXacroPayloadPathAliases = (path) => {
  const normalizedPath = normalizeXacroPayloadPath(path);
  const fileName = normalizedPath.split("/").pop() || normalizedPath;
  if (!isXacroPath(fileName)) {
    return [normalizedPath];
  }

  const lastSlash = normalizedPath.lastIndexOf("/");
  const directory = lastSlash >= 0 ? normalizedPath.slice(0, lastSlash) : "";
  const prefix = directory ? `${directory}/` : "";
  const stem = fileName.replace(/(\.urdf)?\.xacro$/i, "");

  if (isUrdfXacroPath(fileName)) {
    return [normalizedPath, `${prefix}${stem}.xacro`];
  }
  return [normalizedPath, `${prefix}${stem}.urdf.xacro`];
};

const expandXacroPayloadFiles = (files) => {
  const explicitPaths = new Set();
  const normalizedFiles = [];

  for (const file of files) {
    const normalizedPath = normalizeXacroPayloadPath(file.path);
    const normalizedKey = normalizedPath.toLowerCase();
    if (explicitPaths.has(normalizedKey)) continue;
    explicitPaths.add(normalizedKey);
    normalizedFiles.push(
      normalizedPath === file.path
        ? file
        : {
            ...file,
            path: normalizedPath,
          }
    );
  }

  const expandedFiles = [...normalizedFiles];
  const seenPaths = new Set(explicitPaths);
  for (const file of normalizedFiles) {
    for (const aliasPath of buildXacroPayloadPathAliases(file.path).slice(1)) {
      const aliasKey = aliasPath.toLowerCase();
      if (seenPaths.has(aliasKey)) continue;
      seenPaths.add(aliasKey);
      expandedFiles.push({
        ...file,
        path: aliasPath,
      });
    }
  }

  return expandedFiles;
};

const buildXacroExpandRequestPayload = ({ targetPath, files, args, useInorder = true }) => ({
  target_path: normalizeXacroPayloadPath(targetPath),
  files: expandXacroPayloadFiles(files),
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

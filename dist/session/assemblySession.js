"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openStudioForAssemblySession = exports.createAssemblySession = exports.buildStudioAssemblyUrl = void 0;
const node_child_process_1 = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const assemblySessionContract_1 = require("./assemblySessionContract");
const studioRuntime_1 = require("../studio/studioRuntime");
const ILU_STATE_ROOT = path.join(os.homedir(), ".i-love-urdf");
const ILU_ASSEMBLY_SESSION_ROOT = path.join(ILU_STATE_ROOT, "assembly-sessions");
const ASSEMBLY_SESSION_METADATA_FILE = "assembly-session.json";
const ASSET_FILE_EXTENSIONS = new Set([
    ".bin",
    ".dae",
    ".glb",
    ".gltf",
    ".jpeg",
    ".jpg",
    ".ktx2",
    ".mtl",
    ".obj",
    ".png",
    ".stl",
    ".urdf",
    ".webp",
    ".xacro",
    ".xml",
    ".yaml",
    ".yml",
]);
const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};
const sanitizeToken = (value, fallback) => {
    const normalized = value
        .trim()
        .replace(/[^A-Za-z0-9_/-]+/g, "_")
        .replace(/\/+/g, "/")
        .replace(/^_+|_+$/g, "");
    if (!normalized) {
        return fallback;
    }
    const slashNormalized = normalized.replace(/^\/+|\/+$/g, "");
    if (!slashNormalized) {
        return fallback;
    }
    const segmentSafe = slashNormalized
        .split("/")
        .map((segment) => {
        if (!segment) {
            return fallback;
        }
        return /^[0-9]/.test(segment) ? `m_${segment}` : segment;
    })
        .join("/");
    return segmentSafe || fallback;
};
const getAssemblySessionRoot = () => {
    ensureDir(ILU_ASSEMBLY_SESSION_ROOT);
    return ILU_ASSEMBLY_SESSION_ROOT;
};
const getAssemblySessionDir = (sessionId) => path.join(getAssemblySessionRoot(), sessionId);
const normalizeRelativePath = (value) => value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
const toNamespacedPath = (prefix, relativePath) => normalizeRelativePath(`${prefix}/${normalizeRelativePath(relativePath)}`);
const getNearestPackageRoot = (urdfPath) => {
    let current = path.dirname(path.resolve(urdfPath));
    let best = current;
    while (true) {
        if (fs.existsSync(path.join(current, "package.xml"))) {
            best = current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return best;
};
const shouldCopyAssetFile = (filePath) => {
    const basename = path.basename(filePath).toLowerCase();
    if (basename === "package.xml") {
        return true;
    }
    return ASSET_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
};
const copyDirectoryRecursive = (sourceRoot, targetRoot) => {
    let copiedFiles = 0;
    const relativePaths = [];
    const visit = (currentSourceDir) => {
        for (const entry of fs.readdirSync(currentSourceDir, { withFileTypes: true })) {
            const sourcePath = path.join(currentSourceDir, entry.name);
            if (entry.isDirectory()) {
                visit(sourcePath);
                continue;
            }
            if (!entry.isFile() || !shouldCopyAssetFile(sourcePath)) {
                continue;
            }
            const relativePath = normalizeRelativePath(path.relative(sourceRoot, sourcePath));
            const targetPath = path.join(targetRoot, relativePath);
            ensureDir(path.dirname(targetPath));
            fs.copyFileSync(sourcePath, targetPath);
            copiedFiles += 1;
            relativePaths.push(relativePath);
        }
    };
    visit(sourceRoot);
    return { copiedFiles, relativePaths };
};
const buildStudioAssemblyUrl = (assemblySessionId) => {
    return (0, assemblySessionContract_1.buildIluAssemblyStudioUrl)((0, studioRuntime_1.getStudioWebUrl)(), assemblySessionId);
};
exports.buildStudioAssemblyUrl = buildStudioAssemblyUrl;
const openExternalUrl = (url) => {
    const platform = process.platform;
    const opener = platform === "darwin"
        ? { command: "open", args: [url] }
        : platform === "win32"
            ? { command: "cmd", args: ["/c", "start", "", url] }
            : { command: "xdg-open", args: [url] };
    const result = (0, node_child_process_1.spawnSync)(opener.command, opener.args, {
        stdio: "ignore",
        shell: false,
    });
    return result.status === 0;
};
const createAssemblySession = ({ urdfPaths, label, }) => {
    if (urdfPaths.length === 0) {
        throw new Error("At least one URDF path is required.");
    }
    const sessionId = crypto.randomUUID();
    const sessionDir = getAssemblySessionDir(sessionId);
    const workspaceRoot = path.join(sessionDir, "files");
    ensureDir(workspaceRoot);
    const selectedPaths = [];
    const namesByPath = {};
    const sourceByPath = {};
    const robots = [];
    const usedPrefixes = new Set();
    let copiedFiles = 0;
    urdfPaths.forEach((rawUrdfPath, index) => {
        const resolvedUrdfPath = path.resolve(rawUrdfPath);
        if (!fs.existsSync(resolvedUrdfPath) || !fs.statSync(resolvedUrdfPath).isFile()) {
            throw new Error(`URDF file not found: ${rawUrdfPath}`);
        }
        const sourceRoot = getNearestPackageRoot(resolvedUrdfPath);
        const fallbackPrefix = `robot_${index + 1}`;
        let sourcePrefix = sanitizeToken(path.basename(resolvedUrdfPath, path.extname(resolvedUrdfPath)), fallbackPrefix);
        if (usedPrefixes.has(sourcePrefix)) {
            sourcePrefix = `${sourcePrefix}_${index + 1}`;
        }
        usedPrefixes.add(sourcePrefix);
        const targetRoot = path.join(workspaceRoot, sourcePrefix);
        const copied = copyDirectoryRecursive(sourceRoot, targetRoot);
        copiedFiles += copied.copiedFiles;
        const relativeUrdfPath = normalizeRelativePath(path.relative(sourceRoot, resolvedUrdfPath));
        const selectedPath = toNamespacedPath(sourcePrefix, relativeUrdfPath);
        const robotName = path.basename(resolvedUrdfPath);
        const folderLabel = path.basename(sourceRoot);
        selectedPaths.push(selectedPath);
        namesByPath[selectedPath] = robotName;
        sourceByPath[selectedPath] = {
            type: "local",
            folder: folderLabel,
        };
        robots.push({
            id: sourcePrefix,
            name: robotName,
            sourcePrefix,
            selectedPath,
            source: {
                type: "local",
                rootPath: sourceRoot,
                folderLabel,
            },
        });
    });
    const now = new Date().toISOString();
    const snapshot = {
        schema: assemblySessionContract_1.ILU_ASSEMBLY_SESSION_SCHEMA,
        schemaVersion: assemblySessionContract_1.ILU_ASSEMBLY_SESSION_SCHEMA_VERSION,
        sessionId,
        createdAt: now,
        updatedAt: now,
        label: label?.trim() || `Assembly ${new Date().toLocaleString("en-US", { hour12: false })}`,
        workspaceRoot,
        selectedPaths,
        namesByPath,
        sourceByPath,
        robots,
    };
    fs.writeFileSync(path.join(sessionDir, ASSEMBLY_SESSION_METADATA_FILE), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return {
        snapshot,
        sessionDir,
        copiedFiles,
    };
};
exports.createAssemblySession = createAssemblySession;
const openStudioForAssemblySession = async (assemblySessionId) => {
    const studioUrl = (0, exports.buildStudioAssemblyUrl)(assemblySessionId);
    const started = await (0, studioRuntime_1.ensureStudioRunning)({ detached: true });
    const opened = started.ok ? openExternalUrl(studioUrl) : false;
    return {
        studioUrl,
        opened,
        started,
    };
};
exports.openStudioForAssemblySession = openStudioForAssemblySession;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openStudioForReplaceSubrobotCalibration = exports.stageReplaceSubrobotCalibrationSession = void 0;
const node_child_process_1 = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const sharedSession_1 = require("./sharedSession");
const studioRuntime_1 = require("../studio/studioRuntime");
const ILU_STATE_ROOT = path.join(os.homedir(), ".i-love-urdf");
const CALIBRATION_ROOT = path.join(ILU_STATE_ROOT, "calibration-sessions");
const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};
const normalizeRelativePath = (value) => value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
const isAssetFile = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (path.basename(filePath).toLowerCase() === "package.xml") {
        return true;
    }
    return new Set([
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
    ]).has(ext);
};
const findPackageRoot = (inputPath) => {
    let current = path.dirname(path.resolve(inputPath));
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
const copyDirectoryRecursive = (sourceRoot, targetRoot) => {
    let copiedFiles = 0;
    const visit = (currentSourceDir) => {
        for (const entry of fs.readdirSync(currentSourceDir, { withFileTypes: true })) {
            const sourcePath = path.join(currentSourceDir, entry.name);
            if (entry.isDirectory()) {
                visit(sourcePath);
                continue;
            }
            if (!entry.isFile() || !isAssetFile(sourcePath)) {
                continue;
            }
            const relativePath = normalizeRelativePath(path.relative(sourceRoot, sourcePath));
            const targetPath = path.join(targetRoot, relativePath);
            ensureDir(path.dirname(targetPath));
            fs.copyFileSync(sourcePath, targetPath);
            copiedFiles += 1;
        }
    };
    visit(sourceRoot);
    return copiedFiles;
};
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
const stageReplaceSubrobotCalibrationSession = ({ fileNameHint, hostUrdfPath, replacementUrdfPath, urdfContent, }) => {
    const sessionId = crypto.randomUUID();
    const sessionDir = path.join(CALIBRATION_ROOT, sessionId);
    const workspaceRoot = path.join(sessionDir, "workspace");
    ensureDir(workspaceRoot);
    const hostPackageRoot = findPackageRoot(hostUrdfPath);
    const replacementPackageRoot = findPackageRoot(replacementUrdfPath);
    const hostPackageDirName = path.basename(hostPackageRoot);
    const replacementPackageDirName = path.basename(replacementPackageRoot);
    let copiedFiles = 0;
    copiedFiles += copyDirectoryRecursive(hostPackageRoot, path.join(workspaceRoot, hostPackageDirName));
    if (path.resolve(replacementPackageRoot) !== path.resolve(hostPackageRoot)) {
        copiedFiles += copyDirectoryRecursive(replacementPackageRoot, path.join(workspaceRoot, replacementPackageDirName));
    }
    const workingRelativePath = normalizeRelativePath(fileNameHint || "robot.urdf").replace(/\.(urdf\.xacro|xacro)$/i, ".urdf");
    const workingUrdfPath = path.join(workspaceRoot, workingRelativePath);
    ensureDir(path.dirname(workingUrdfPath));
    fs.writeFileSync(workingUrdfPath, urdfContent, "utf8");
    const snapshot = (0, sharedSession_1.writeIluSharedSession)({
        sessionId,
        urdfContent,
        fileNameHint: workingRelativePath,
        loadedSource: {
            source: "local-repo",
            urdfPath: workingUrdfPath,
            localPath: workspaceRoot,
            repositoryUrdfPath: workingRelativePath,
        },
        lastUrdfPath: workingUrdfPath,
    });
    return {
        sessionId: snapshot.sessionId,
        sessionDir,
        workspaceRoot,
        workingUrdfPath: snapshot.workingUrdfPath,
        studioUrl: (0, sharedSession_1.buildStudioSessionUrl)(snapshot.sessionId),
        copiedFiles,
    };
};
exports.stageReplaceSubrobotCalibrationSession = stageReplaceSubrobotCalibrationSession;
const openStudioForReplaceSubrobotCalibration = async (sessionId, options = {}) => {
    const studioUrl = (0, sharedSession_1.buildStudioSessionUrl)(sessionId, {
        focusJoint: options.focusJoint,
        calibrateMode: options.calibrateMode,
    });
    const started = await (0, studioRuntime_1.ensureStudioRunning)({ detached: true });
    const opened = started.ok ? openExternalUrl(studioUrl) : false;
    return {
        studioUrl,
        opened,
        started,
    };
};
exports.openStudioForReplaceSubrobotCalibration = openStudioForReplaceSubrobotCalibration;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openVisualizerForShellState = exports.buildStudioSessionUrl = exports.attachShellToSharedSession = exports.persistShellSharedSession = exports.applySharedSessionSnapshotToState = exports.writeIluSharedSession = exports.readLatestIluSharedSession = exports.rememberIluRecentSession = exports.readIluSharedSession = exports.getIluSharedSessionWorkingUrdfPath = exports.getIluSharedSessionMetadataPath = exports.getIluSharedSessionDir = exports.getIluSharedSessionRoot = void 0;
const node_child_process_1 = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const cliShellConfig_1 = require("../commands/cliShellConfig");
const cliShellUi_1 = require("../commands/cliShellUi");
const studioRuntime_1 = require("../studio/studioRuntime");
const sharedSessionContract_1 = require("./sharedSessionContract");
const ILU_STATE_ROOT = path.join(os.homedir(), ".i-love-urdf");
const ILU_SESSION_ROOT = path.join(ILU_STATE_ROOT, "sessions");
const SESSION_METADATA_FILE = "session.json";
const RECENT_SESSION_POINTER_FILE = path.join(ILU_STATE_ROOT, "last-session.json");
const sanitizeHint = (hint) => {
    const normalized = path.basename(hint || "robot.urdf").replace(/\.(urdf\.xacro|xacro|zip)$/i, ".urdf");
    const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, "-");
    return safe.toLowerCase().endsWith(".urdf") ? safe : `${safe || "robot"}.urdf`;
};
const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};
const getIluSharedSessionRoot = () => {
    ensureDir(ILU_SESSION_ROOT);
    return ILU_SESSION_ROOT;
};
exports.getIluSharedSessionRoot = getIluSharedSessionRoot;
const getIluSharedSessionDir = (sessionId) => path.join((0, exports.getIluSharedSessionRoot)(), sessionId);
exports.getIluSharedSessionDir = getIluSharedSessionDir;
const getIluSharedSessionMetadataPath = (sessionId) => path.join((0, exports.getIluSharedSessionDir)(sessionId), SESSION_METADATA_FILE);
exports.getIluSharedSessionMetadataPath = getIluSharedSessionMetadataPath;
const getIluSharedSessionWorkingUrdfPath = (sessionId, fileNameHint = "robot.urdf") => path.join((0, exports.getIluSharedSessionDir)(sessionId), sanitizeHint(fileNameHint));
exports.getIluSharedSessionWorkingUrdfPath = getIluSharedSessionWorkingUrdfPath;
const writeMetadata = (snapshot) => {
    fs.writeFileSync((0, exports.getIluSharedSessionMetadataPath)(snapshot.sessionId), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
};
const writeRecentSessionPointer = (snapshot) => {
    ensureDir(ILU_STATE_ROOT);
    const pointer = {
        sessionId: snapshot.sessionId,
        updatedAt: snapshot.updatedAt,
    };
    fs.writeFileSync(RECENT_SESSION_POINTER_FILE, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
};
const readRecentSessionPointer = () => {
    if (!fs.existsSync(RECENT_SESSION_POINTER_FILE)) {
        return null;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(RECENT_SESSION_POINTER_FILE, "utf8"));
        if (typeof raw.sessionId !== "string" || raw.sessionId.trim().length === 0) {
            return null;
        }
        return {
            sessionId: raw.sessionId.trim(),
            updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        };
    }
    catch {
        return null;
    }
};
const readIluSharedSession = (sessionId) => {
    const metadataPath = (0, exports.getIluSharedSessionMetadataPath)(sessionId);
    if (!fs.existsSync(metadataPath)) {
        return null;
    }
    try {
        return (0, sharedSessionContract_1.coerceIluSharedSessionSnapshot)(JSON.parse(fs.readFileSync(metadataPath, "utf8")));
    }
    catch {
        return null;
    }
};
exports.readIluSharedSession = readIluSharedSession;
const rememberIluRecentSession = (snapshot) => {
    writeRecentSessionPointer(snapshot);
};
exports.rememberIluRecentSession = rememberIluRecentSession;
const readLatestIluSharedSession = () => {
    const pointer = readRecentSessionPointer();
    if (pointer) {
        const pointedSnapshot = (0, exports.readIluSharedSession)(pointer.sessionId);
        if (pointedSnapshot && fs.existsSync(pointedSnapshot.workingUrdfPath)) {
            return pointedSnapshot;
        }
    }
    if (!fs.existsSync(ILU_SESSION_ROOT)) {
        return null;
    }
    let latestSnapshot = null;
    for (const entry of fs.readdirSync(ILU_SESSION_ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            continue;
        }
        const snapshot = (0, exports.readIluSharedSession)(entry.name);
        if (!snapshot || !fs.existsSync(snapshot.workingUrdfPath)) {
            continue;
        }
        if (!latestSnapshot) {
            latestSnapshot = snapshot;
            continue;
        }
        const snapshotUpdatedAt = Date.parse(snapshot.updatedAt);
        const latestUpdatedAt = Date.parse(latestSnapshot.updatedAt);
        if (Number.isFinite(snapshotUpdatedAt) && Number.isFinite(latestUpdatedAt)) {
            if (snapshotUpdatedAt > latestUpdatedAt) {
                latestSnapshot = snapshot;
            }
            continue;
        }
        if (snapshot.updatedAt > latestSnapshot.updatedAt) {
            latestSnapshot = snapshot;
        }
    }
    if (latestSnapshot) {
        writeRecentSessionPointer(latestSnapshot);
    }
    return latestSnapshot;
};
exports.readLatestIluSharedSession = readLatestIluSharedSession;
const writeIluSharedSession = (params) => {
    const sessionId = params.sessionId?.trim() || crypto.randomUUID();
    const sessionDir = (0, exports.getIluSharedSessionDir)(sessionId);
    ensureDir(sessionDir);
    const previous = (0, exports.readIluSharedSession)(sessionId);
    const workingUrdfPath = previous?.workingUrdfPath || (0, exports.getIluSharedSessionWorkingUrdfPath)(sessionId, params.fileNameHint);
    fs.writeFileSync(workingUrdfPath, params.urdfContent, "utf8");
    const now = new Date().toISOString();
    const loadedSource = params.loadedSource
        ? {
            ...params.loadedSource,
            urdfPath: workingUrdfPath,
        }
        : null;
    const snapshot = {
        schema: sharedSessionContract_1.ILU_SHARED_SESSION_SCHEMA,
        schemaVersion: sharedSessionContract_1.ILU_SHARED_SESSION_SCHEMA_VERSION,
        sessionId,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        workingUrdfPath,
        lastUrdfPath: workingUrdfPath,
        loadedSource,
    };
    writeMetadata(snapshot);
    writeRecentSessionPointer(snapshot);
    return snapshot;
};
exports.writeIluSharedSession = writeIluSharedSession;
const applySharedSessionSnapshotToState = (state, snapshot, options = {}) => {
    state.sharedSessionId = snapshot.sessionId;
    state.lastUrdfPath = snapshot.workingUrdfPath;
    if (options.resetVisualizerPrompt !== false) {
        state.visualizerPromptResolved = false;
    }
    state.loadedSource = snapshot.loadedSource
        ? {
            source: snapshot.loadedSource.source,
            urdfPath: snapshot.workingUrdfPath,
            localPath: snapshot.loadedSource.localPath,
            githubRef: snapshot.loadedSource.githubRef,
            githubRevision: snapshot.loadedSource.githubRevision,
            repositoryUrdfPath: snapshot.loadedSource.repositoryUrdfPath,
        }
        : null;
};
exports.applySharedSessionSnapshotToState = applySharedSessionSnapshotToState;
const getSharedSessionFileHint = (state) => state.loadedSource?.repositoryUrdfPath ||
    state.loadedSource?.localPath ||
    state.lastUrdfPath ||
    "robot.urdf";
const getSharedSessionLoadedSource = (state) => {
    const loadedSource = state.loadedSource;
    return loadedSource
        ? {
            source: loadedSource.source,
            urdfPath: loadedSource.urdfPath,
            localPath: loadedSource.localPath,
            githubRef: loadedSource.githubRef,
            githubRevision: loadedSource.githubRevision,
            repositoryUrdfPath: loadedSource.repositoryUrdfPath,
        }
        : null;
};
const persistShellSharedSession = (state, options = {}) => {
    const sourceUrdfPath = options.sourceUrdfPath || state.loadedSource?.urdfPath || state.lastUrdfPath;
    const urdfContent = typeof options.urdfContent === "string"
        ? options.urdfContent
        : sourceUrdfPath && fs.existsSync(sourceUrdfPath)
            ? fs.readFileSync(sourceUrdfPath, "utf8")
            : null;
    if (!urdfContent) {
        return null;
    }
    const snapshot = (0, exports.writeIluSharedSession)({
        sessionId: state.sharedSessionId,
        urdfContent,
        fileNameHint: options.fileNameHint || getSharedSessionFileHint(state),
        loadedSource: getSharedSessionLoadedSource(state),
        lastUrdfPath: sourceUrdfPath || state.lastUrdfPath || "",
    });
    (0, exports.applySharedSessionSnapshotToState)(state, snapshot, { resetVisualizerPrompt: false });
    return snapshot;
};
exports.persistShellSharedSession = persistShellSharedSession;
const attachShellToSharedSession = (state, sessionId) => {
    const snapshot = (0, exports.readIluSharedSession)(sessionId);
    if (!snapshot) {
        throw new Error(`Shared ilu session not found: ${sessionId}`);
    }
    if (!fs.existsSync(snapshot.workingUrdfPath)) {
        throw new Error(`Shared ilu working URDF is missing: ${snapshot.workingUrdfPath}`);
    }
    (0, exports.applySharedSessionSnapshotToState)(state, snapshot);
    (0, exports.rememberIluRecentSession)(snapshot);
    return snapshot;
};
exports.attachShellToSharedSession = attachShellToSharedSession;
const buildStudioSessionUrl = (sessionId) => {
    const studioUrl = new URL((0, studioRuntime_1.getStudioWebUrl)());
    studioUrl.searchParams.set("ilu_session", sessionId);
    return studioUrl.toString();
};
exports.buildStudioSessionUrl = buildStudioSessionUrl;
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
const openVisualizerForShellState = async (state) => {
    const snapshot = (0, exports.persistShellSharedSession)(state);
    if (!snapshot) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("visualizer", "load a repo or local path first"),
            notice: { kind: "info", text: "no loaded source yet" },
            clearSession: false,
        };
    }
    state.visualizerPromptResolved = true;
    const studioUrl = (0, exports.buildStudioSessionUrl)(snapshot.sessionId);
    const started = await (0, studioRuntime_1.ensureStudioRunning)({ detached: true });
    const panelLines = [
        `session ${snapshot.sessionId}`,
        `working urdf ${(0, cliShellConfig_1.quoteForPreview)(snapshot.workingUrdfPath)}`,
        `urdf studio ${studioUrl}`,
    ];
    if (started.ok === false) {
        panelLines.push(`launcher ${started.reason}`);
        panelLines.push("start URDF Studio manually, then open the URL above");
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("visualizer", panelLines.join("\n"), "info"),
            notice: {
                kind: "warning",
                text: `could not start URDF Studio: ${started.reason}`,
            },
            clearSession: false,
            visualizerFailureCode: started.code,
        };
    }
    state.visualizerOpened = true;
    state.exitPrompt = null;
    if (started.handle.startedHere && started.studioRoot) {
        panelLines.push(`studio repo ${(0, cliShellConfig_1.quoteForPreview)(started.studioRoot)}`);
    }
    const opened = openExternalUrl(studioUrl);
    return {
        panel: (0, cliShellUi_1.createOutputPanel)("visualizer", panelLines.join("\n"), opened ? "success" : "info"),
        notice: {
            kind: opened ? "success" : "info",
            text: opened
                ? started.handle.startedHere
                    ? "started and opened URDF Studio for the current session"
                    : "opened URDF Studio for the current session"
                : "URDF Studio is ready. Open the visualizer URL in your browser",
        },
        clearSession: false,
    };
};
exports.openVisualizerForShellState = openVisualizerForShellState;

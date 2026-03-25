"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installStudio = exports.ensureStudioRunning = exports.stopManagedStudioImmediately = exports.stopManagedStudio = exports.waitForStudioReady = exports.isStudioReady = exports.getStudioInstallState = exports.resolveStudioRoot = exports.isStudioRepoRoot = exports.getPreferredStudioInstallRoot = exports.getDefaultStudioRootCandidates = exports.getStudioApiHealthUrl = exports.getStudioWebUrl = exports.isManagedStudioRunning = exports.readManagedStudioRuntime = exports.getManagedStudioRuntimePath = void 0;
const node_child_process_1 = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const DEFAULT_WEB_URL = process.env.URDF_STUDIO_URL?.trim() || "http://127.0.0.1:5173/";
const DEFAULT_API_HEALTH_URL = process.env.URDF_STUDIO_API_URL?.trim() || "http://127.0.0.1:8000/health";
const DEFAULT_STUDIO_REPO_NAMES = ["urdf-studio-unprod", "urdf-studio"];
const DEFAULT_STUDIO_REPO_URL = "https://github.com/urdf-studio/urdf-studio-unprod.git";
const STUDIO_START_TIMEOUT_MS = 60000;
const STUDIO_STOP_TIMEOUT_MS = 10000;
const STUDIO_POLL_INTERVAL_MS = 500;
const STUDIO_INSTALL_MAX_BUFFER = 20 * 1024 * 1024;
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const fetchOk = async (url) => {
    try {
        const response = await fetch(url, { redirect: "follow" });
        return response.ok;
    }
    catch {
        return false;
    }
};
const getStudioRunScriptPath = (studioRoot) => path.join(studioRoot, "tools", "scripts", "run.js");
const getIluStateRoot = () => {
    const explicitRoot = process.env.ILU_STATE_ROOT?.trim();
    return explicitRoot ? path.resolve(explicitRoot) : path.join(os.homedir(), ".i-love-urdf");
};
const getManagedStudioRuntimePath = () => {
    const explicitPath = process.env.ILU_STUDIO_RUNTIME_FILE?.trim();
    return explicitPath ? path.resolve(explicitPath) : path.join(getIluStateRoot(), "studio-runtime.json");
};
exports.getManagedStudioRuntimePath = getManagedStudioRuntimePath;
const clearManagedStudioRuntime = () => {
    try {
        fs.rmSync((0, exports.getManagedStudioRuntimePath)(), { force: true });
    }
    catch {
        // Ignore stale cleanup failures.
    }
};
const writeManagedStudioRuntime = (runtime) => {
    const runtimePath = (0, exports.getManagedStudioRuntimePath)();
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(`${runtimePath}`, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
};
const isProcessActive = (pid) => {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error?.code === "EPERM";
    }
};
const readUnixProcessList = () => {
    if (process.platform === "win32") {
        return [];
    }
    const psResult = (0, node_child_process_1.spawnSync)("ps", ["-axo", "pid=,command="], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    if (psResult.status !== 0 || typeof psResult.stdout !== "string") {
        return [];
    }
    return psResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const match = /^(\d+)\s+(.*)$/.exec(line);
        if (!match) {
            return null;
        }
        const pid = Number.parseInt(match[1] ?? "", 10);
        const command = match[2]?.trim() ?? "";
        if (!Number.isInteger(pid) || pid <= 0 || command.length === 0) {
            return null;
        }
        return {
            pid,
            command,
        };
    })
        .filter((entry) => entry !== null);
};
const findStudioLauncherPid = (studioRoot) => {
    const launcherPath = path.resolve(getStudioRunScriptPath(studioRoot));
    const match = readUnixProcessList().find((entry) => entry.command.includes(launcherPath));
    return match?.pid ?? null;
};
const coerceManagedStudioRuntime = (value) => {
    if (!value || typeof value !== "object") {
        return null;
    }
    const candidate = value;
    if (!Number.isInteger(candidate.pid) ||
        (candidate.pid ?? 0) <= 0 ||
        typeof candidate.studioRoot !== "string" ||
        candidate.studioRoot.trim().length === 0 ||
        typeof candidate.webUrl !== "string" ||
        candidate.webUrl.trim().length === 0 ||
        typeof candidate.apiHealthUrl !== "string" ||
        candidate.apiHealthUrl.trim().length === 0 ||
        typeof candidate.startedAt !== "string" ||
        candidate.startedAt.trim().length === 0) {
        return null;
    }
    return {
        pid: candidate.pid,
        studioRoot: candidate.studioRoot,
        webUrl: candidate.webUrl,
        apiHealthUrl: candidate.apiHealthUrl,
        startedAt: candidate.startedAt,
    };
};
const readManagedStudioRuntime = () => {
    const runtimePath = (0, exports.getManagedStudioRuntimePath)();
    if (!fs.existsSync(runtimePath)) {
        return null;
    }
    try {
        const runtime = coerceManagedStudioRuntime(JSON.parse(fs.readFileSync(runtimePath, "utf8")));
        if (!runtime || !isProcessActive(runtime.pid)) {
            clearManagedStudioRuntime();
            return null;
        }
        return runtime;
    }
    catch {
        clearManagedStudioRuntime();
        return null;
    }
};
exports.readManagedStudioRuntime = readManagedStudioRuntime;
const isManagedStudioRunning = () => (0, exports.readManagedStudioRuntime)() !== null;
exports.isManagedStudioRunning = isManagedStudioRunning;
const getStudioWebUrl = () => DEFAULT_WEB_URL;
exports.getStudioWebUrl = getStudioWebUrl;
const getStudioApiHealthUrl = () => DEFAULT_API_HEALTH_URL;
exports.getStudioApiHealthUrl = getStudioApiHealthUrl;
const getDefaultStudioRootCandidates = () => DEFAULT_STUDIO_REPO_NAMES.map((name) => path.resolve(__dirname, "..", "..", "..", name));
exports.getDefaultStudioRootCandidates = getDefaultStudioRootCandidates;
const getPreferredStudioInstallRoot = (explicitEnv) => {
    const explicit = typeof explicitEnv === "string" ? explicitEnv.trim() : process.env.URDF_STUDIO_REPO?.trim() || "";
    if (explicit) {
        return path.resolve(explicit);
    }
    return (0, exports.getDefaultStudioRootCandidates)()[0] ?? path.resolve(__dirname, "..", "..", "..", "urdf-studio-unprod");
};
exports.getPreferredStudioInstallRoot = getPreferredStudioInstallRoot;
const isStudioRepoRoot = (studioRoot) => {
    const resolved = path.resolve(studioRoot);
    return (fs.existsSync(path.join(resolved, "package.json")) &&
        fs.existsSync(getStudioRunScriptPath(resolved)));
};
exports.isStudioRepoRoot = isStudioRepoRoot;
const resolveStudioRoot = (options = {}) => {
    const explicit = typeof options.explicitEnv === "string"
        ? options.explicitEnv.trim()
        : process.env.URDF_STUDIO_REPO?.trim() || "";
    if (explicit) {
        const resolved = path.resolve(explicit);
        return (0, exports.isStudioRepoRoot)(resolved) ? resolved : null;
    }
    const candidates = options.candidateRoots ?? (0, exports.getDefaultStudioRootCandidates)();
    for (const candidate of candidates) {
        const resolved = path.resolve(candidate);
        if ((0, exports.isStudioRepoRoot)(resolved)) {
            return resolved;
        }
    }
    return null;
};
exports.resolveStudioRoot = resolveStudioRoot;
const discoverRunningStudioRuntime = (options = {}) => {
    const studioRoot = (0, exports.resolveStudioRoot)(options);
    if (!studioRoot) {
        return null;
    }
    const pid = findStudioLauncherPid(studioRoot);
    if (!pid || !isProcessActive(pid)) {
        return null;
    }
    return {
        pid,
        studioRoot,
        webUrl: (0, exports.getStudioWebUrl)(),
        apiHealthUrl: (0, exports.getStudioApiHealthUrl)(),
        startedAt: new Date().toISOString(),
    };
};
const adoptRunningStudioRuntime = (options = {}) => {
    const managed = (0, exports.readManagedStudioRuntime)();
    if (managed) {
        return managed;
    }
    const discovered = discoverRunningStudioRuntime(options);
    if (!discovered) {
        return null;
    }
    writeManagedStudioRuntime(discovered);
    return discovered;
};
const getStudioVenvPythonPath = (studioRoot) => process.platform === "win32"
    ? path.join(studioRoot, ".venv", "Scripts", "python.exe")
    : path.join(studioRoot, ".venv", "bin", "python3");
const isStudioSetupComplete = (studioRoot) => fs.existsSync(path.join(studioRoot, "node_modules")) &&
    fs.existsSync(getStudioVenvPythonPath(studioRoot));
const getStudioInstallState = (options = {}) => {
    const installRoot = (0, exports.getPreferredStudioInstallRoot)(options.explicitEnv);
    const studioRoot = (0, exports.resolveStudioRoot)(options);
    if (!studioRoot) {
        return {
            status: "missing-repo",
            studioRoot: null,
            installRoot,
            reason: "URDF Studio repo not found. Set URDF_STUDIO_REPO or install it next to i-love-urdf as urdf-studio-unprod or urdf-studio.",
        };
    }
    if (!isStudioSetupComplete(studioRoot)) {
        return {
            status: "needs-setup",
            studioRoot,
            installRoot: studioRoot,
            reason: 'URDF Studio is present but not set up yet. Run "npm run setup" in the Studio repo first.',
        };
    }
    return {
        status: "ready",
        studioRoot,
        installRoot: studioRoot,
    };
};
exports.getStudioInstallState = getStudioInstallState;
const isStudioReady = async (options = {}) => {
    const webUrl = options.webUrl ?? (0, exports.getStudioWebUrl)();
    const apiHealthUrl = options.apiHealthUrl ?? (0, exports.getStudioApiHealthUrl)();
    const [webReady, apiReady] = await Promise.all([fetchOk(webUrl), fetchOk(apiHealthUrl)]);
    return webReady && apiReady;
};
exports.isStudioReady = isStudioReady;
const waitForStudioReady = async (options = {}) => {
    const timeoutMs = options.timeoutMs ?? STUDIO_START_TIMEOUT_MS;
    const webUrl = options.webUrl ?? (0, exports.getStudioWebUrl)();
    const apiHealthUrl = options.apiHealthUrl ?? (0, exports.getStudioApiHealthUrl)();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await (0, exports.isStudioReady)({ webUrl, apiHealthUrl })) {
            return true;
        }
        await sleep(STUDIO_POLL_INTERVAL_MS);
    }
    return false;
};
exports.waitForStudioReady = waitForStudioReady;
const createStudioClose = (child, detached) => () => {
    if (child.killed) {
        return;
    }
    if (detached && typeof child.pid === "number" && child.pid > 0 && process.platform !== "win32") {
        try {
            process.kill(-child.pid, "SIGTERM");
            return;
        }
        catch {
            // Fall back to targeting just the launcher process.
        }
    }
    try {
        child.kill("SIGTERM");
    }
    catch {
        // Ignore cleanup failures.
    }
};
const stopManagedStudioProcess = (runtime) => {
    if (process.platform !== "win32") {
        try {
            process.kill(-runtime.pid, "SIGTERM");
            return;
        }
        catch {
            // Fall back to targeting the launcher process directly.
        }
    }
    try {
        process.kill(runtime.pid, "SIGTERM");
    }
    catch {
        // Ignore cleanup failures here and let the caller verify the final state.
    }
};
const waitForManagedStudioStop = async (runtime, timeoutMs = STUDIO_STOP_TIMEOUT_MS) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const stillRunning = isProcessActive(runtime.pid);
        const stillReady = await (0, exports.isStudioReady)({
            webUrl: runtime.webUrl,
            apiHealthUrl: runtime.apiHealthUrl,
        });
        if (!stillRunning && !stillReady) {
            return true;
        }
        await sleep(STUDIO_POLL_INTERVAL_MS);
    }
    return !isProcessActive(runtime.pid) && !(await (0, exports.isStudioReady)({
        webUrl: runtime.webUrl,
        apiHealthUrl: runtime.apiHealthUrl,
    }));
};
const stopManagedStudio = async () => {
    const runtime = adoptRunningStudioRuntime();
    if (!runtime) {
        return {
            ok: false,
            stopped: false,
            reason: "URDF Studio is not running under ilu.",
            runtime: null,
        };
    }
    stopManagedStudioProcess(runtime);
    const stopped = await waitForManagedStudioStop(runtime);
    if (!stopped) {
        return {
            ok: false,
            stopped: false,
            reason: "URDF Studio did not stop in time.",
            runtime,
        };
    }
    clearManagedStudioRuntime();
    return {
        ok: true,
        stopped: true,
        runtime,
    };
};
exports.stopManagedStudio = stopManagedStudio;
const stopManagedStudioImmediately = () => {
    const runtime = adoptRunningStudioRuntime();
    if (!runtime) {
        return false;
    }
    stopManagedStudioProcess(runtime);
    clearManagedStudioRuntime();
    return true;
};
exports.stopManagedStudioImmediately = stopManagedStudioImmediately;
const ensureStudioRunning = async (options = {}) => {
    const webUrl = (0, exports.getStudioWebUrl)();
    const apiHealthUrl = (0, exports.getStudioApiHealthUrl)();
    const existingRuntime = adoptRunningStudioRuntime();
    if (existingRuntime) {
        const ready = await (0, exports.waitForStudioReady)({
            timeoutMs: options.timeoutMs,
            webUrl,
            apiHealthUrl,
        });
        if (ready) {
            return {
                ok: true,
                handle: {
                    startedHere: false,
                    process: null,
                    close: () => {
                        void (0, exports.stopManagedStudio)();
                    },
                },
                studioRoot: existingRuntime.studioRoot,
                webUrl,
                apiHealthUrl,
            };
        }
        stopManagedStudioProcess(existingRuntime);
        const stopped = await waitForManagedStudioStop(existingRuntime);
        clearManagedStudioRuntime();
        if (!stopped) {
            return {
                ok: false,
                code: "startup-failed",
                reason: "An existing URDF Studio launcher was running but could not be recovered.",
                studioRoot: existingRuntime.studioRoot,
                webUrl,
                apiHealthUrl,
            };
        }
    }
    if (await (0, exports.isStudioReady)({ webUrl, apiHealthUrl })) {
        return {
            ok: true,
            handle: {
                startedHere: false,
                process: null,
                close: () => {
                    void (0, exports.stopManagedStudio)();
                },
            },
            studioRoot: null,
            webUrl,
            apiHealthUrl,
        };
    }
    const studioState = (0, exports.getStudioInstallState)();
    if (studioState.status !== "ready") {
        return {
            ok: false,
            code: studioState.status,
            reason: studioState.reason,
            studioRoot: studioState.studioRoot,
            webUrl,
            apiHealthUrl,
        };
    }
    const studioRoot = studioState.studioRoot;
    const runScript = getStudioRunScriptPath(studioRoot);
    const detached = options.detached === true;
    let startupFailure = null;
    const child = (0, node_child_process_1.spawn)(process.execPath, [runScript], {
        cwd: studioRoot,
        env: {
            ...process.env,
            URDF_WEB_HOST: "127.0.0.1",
            URDF_WEB_BIND_HOST: "127.0.0.1",
            URDF_API_HOST: "127.0.0.1",
            URDF_API_BIND_HOST: "127.0.0.1",
        },
        stdio: "ignore",
        detached,
    });
    const close = createStudioClose(child, detached);
    if (detached) {
        child.unref();
    }
    child.once("error", (error) => {
        startupFailure = error instanceof Error ? error.message : String(error);
    });
    child.once("exit", (code, signal) => {
        if (startupFailure) {
            return;
        }
        startupFailure =
            typeof code === "number"
                ? "URDF Studio exited before it became ready (status " + code + ")."
                : "URDF Studio exited before it became ready (" + (signal || "unknown signal") + ").";
    });
    const ready = await (0, exports.waitForStudioReady)({
        timeoutMs: options.timeoutMs,
        webUrl,
        apiHealthUrl,
    });
    if (!ready) {
        close();
        return {
            ok: false,
            code: "startup-failed",
            reason: startupFailure || "URDF Studio did not become ready in time.",
            studioRoot,
            webUrl,
            apiHealthUrl,
        };
    }
    if (detached && typeof child.pid === "number" && child.pid > 0) {
        writeManagedStudioRuntime({
            pid: child.pid,
            studioRoot,
            webUrl,
            apiHealthUrl,
            startedAt: new Date().toISOString(),
        });
    }
    return {
        ok: true,
        handle: {
            startedHere: true,
            process: child,
            close,
        },
        studioRoot,
        webUrl,
        apiHealthUrl,
    };
};
exports.ensureStudioRunning = ensureStudioRunning;
const getNpmCommand = () => {
    const npmExecPath = typeof process.env.npm_execpath === "string" ? process.env.npm_execpath.trim() : "";
    if (npmExecPath) {
        return {
            command: process.execPath,
            argsPrefix: [npmExecPath],
        };
    }
    return {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        argsPrefix: [],
    };
};
const collectCommandOutputLines = (output) => output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-8);
const installStudio = () => {
    const initialState = (0, exports.getStudioInstallState)();
    let studioRoot = initialState.installRoot;
    let cloned = false;
    if (initialState.status === "ready") {
        studioRoot = initialState.studioRoot;
    }
    else if (initialState.status === "missing-repo") {
        fs.mkdirSync(path.dirname(studioRoot), { recursive: true });
        const clone = (0, node_child_process_1.spawnSync)("git", ["clone", "--depth", "1", DEFAULT_STUDIO_REPO_URL, studioRoot], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: STUDIO_INSTALL_MAX_BUFFER,
        });
        if (clone.status !== 0) {
            return {
                ok: false,
                studioRoot,
                cloned,
                reason: "URDF Studio clone failed.",
                outputLines: collectCommandOutputLines(`${clone.stdout || ""}\n${clone.stderr || ""}`),
            };
        }
        cloned = true;
    }
    else if (initialState.studioRoot) {
        studioRoot = initialState.studioRoot;
    }
    const { command, argsPrefix } = getNpmCommand();
    const setup = (0, node_child_process_1.spawnSync)(command, [...argsPrefix, "run", "setup"], {
        cwd: studioRoot,
        env: {
            ...process.env,
            URDF_STUDIO_SKIP_TOKENS: "1",
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: STUDIO_INSTALL_MAX_BUFFER,
    });
    const outputLines = collectCommandOutputLines(`${setup.stdout || ""}\n${setup.stderr || ""}`);
    if (setup.status !== 0) {
        return {
            ok: false,
            studioRoot,
            cloned,
            reason: "URDF Studio setup failed.",
            outputLines,
        };
    }
    return {
        ok: true,
        studioRoot,
        cloned,
        outputLines,
    };
};
exports.installStudio = installStudio;

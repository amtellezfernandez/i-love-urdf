import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as process from "node:process";

const DEFAULT_WEB_URL = process.env.URDF_STUDIO_URL?.trim() || "http://127.0.0.1:5173/";
const DEFAULT_API_HEALTH_URL = process.env.URDF_STUDIO_API_URL?.trim() || "http://127.0.0.1:8000/health";
const DEFAULT_STUDIO_REPO_NAMES = ["urdf-studio-unprod", "urdf-studio"] as const;
const DEFAULT_STUDIO_REPO_URL = "https://github.com/urdf-studio/urdf-studio-unprod.git";
const STUDIO_START_TIMEOUT_MS = 60_000;
const STUDIO_STOP_TIMEOUT_MS = 10_000;
const STUDIO_POLL_INTERVAL_MS = 500;
const STUDIO_INSTALL_MAX_BUFFER = 20 * 1024 * 1024;

export type StudioFailureCode = "missing-repo" | "needs-setup" | "startup-failed";

export type ManagedStudioRuntime = {
  pid: number;
  studioRoot: string;
  webUrl: string;
  apiHealthUrl: string;
  startedAt: string;
};

export type StudioHandle = {
  startedHere: boolean;
  process: ChildProcess | null;
  close: () => void;
};

export type EnsureStudioRunningResult =
  | {
      ok: true;
      handle: StudioHandle;
      studioRoot: string | null;
      webUrl: string;
      apiHealthUrl: string;
    }
  | {
      ok: false;
      code: StudioFailureCode;
      reason: string;
      studioRoot: string | null;
      webUrl: string;
      apiHealthUrl: string;
    };

export type StudioInstallState =
  | {
      status: "ready";
      studioRoot: string;
      installRoot: string;
    }
  | {
      status: "missing-repo" | "needs-setup";
      studioRoot: string | null;
      installRoot: string;
      reason: string;
    };

export type InstallStudioResult =
  | {
      ok: true;
      studioRoot: string;
      cloned: boolean;
      outputLines: string[];
    }
  | {
      ok: false;
      studioRoot: string;
      cloned: boolean;
      reason: string;
      outputLines: string[];
    };

export type StopManagedStudioResult =
  | {
      ok: true;
      stopped: boolean;
      runtime: ManagedStudioRuntime;
    }
  | {
      ok: false;
      stopped: boolean;
      reason: string;
      runtime: ManagedStudioRuntime | null;
    };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const fetchOk = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
};

const getStudioRunScriptPath = (studioRoot: string): string =>
  path.join(studioRoot, "tools", "scripts", "run.js");

const getIluStateRoot = (): string => {
  const explicitRoot = process.env.ILU_STATE_ROOT?.trim();
  return explicitRoot ? path.resolve(explicitRoot) : path.join(os.homedir(), ".i-love-urdf");
};

export const getManagedStudioRuntimePath = (): string => {
  const explicitPath = process.env.ILU_STUDIO_RUNTIME_FILE?.trim();
  return explicitPath ? path.resolve(explicitPath) : path.join(getIluStateRoot(), "studio-runtime.json");
};

const clearManagedStudioRuntime = () => {
  try {
    fs.rmSync(getManagedStudioRuntimePath(), { force: true });
  } catch {
    // Ignore stale cleanup failures.
  }
};

const writeManagedStudioRuntime = (runtime: ManagedStudioRuntime) => {
  const runtimePath = getManagedStudioRuntimePath();
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(`${runtimePath}`, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
};

const isProcessActive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code === "EPERM";
  }
};

const coerceManagedStudioRuntime = (value: unknown): ManagedStudioRuntime | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ManagedStudioRuntime>;
  if (
    !Number.isInteger(candidate.pid) ||
    (candidate.pid ?? 0) <= 0 ||
    typeof candidate.studioRoot !== "string" ||
    candidate.studioRoot.trim().length === 0 ||
    typeof candidate.webUrl !== "string" ||
    candidate.webUrl.trim().length === 0 ||
    typeof candidate.apiHealthUrl !== "string" ||
    candidate.apiHealthUrl.trim().length === 0 ||
    typeof candidate.startedAt !== "string" ||
    candidate.startedAt.trim().length === 0
  ) {
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

export const readManagedStudioRuntime = (): ManagedStudioRuntime | null => {
  const runtimePath = getManagedStudioRuntimePath();
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
  } catch {
    clearManagedStudioRuntime();
    return null;
  }
};

export const isManagedStudioRunning = (): boolean => readManagedStudioRuntime() !== null;

export const getStudioWebUrl = (): string => DEFAULT_WEB_URL;

export const getStudioApiHealthUrl = (): string => DEFAULT_API_HEALTH_URL;

export const getDefaultStudioRootCandidates = (): string[] =>
  DEFAULT_STUDIO_REPO_NAMES.map((name) => path.resolve(__dirname, "..", "..", "..", name));

export const getPreferredStudioInstallRoot = (explicitEnv?: string | null): string => {
  const explicit = typeof explicitEnv === "string" ? explicitEnv.trim() : process.env.URDF_STUDIO_REPO?.trim() || "";
  if (explicit) {
    return path.resolve(explicit);
  }

  return getDefaultStudioRootCandidates()[0] ?? path.resolve(__dirname, "..", "..", "..", "urdf-studio-unprod");
};

export const isStudioRepoRoot = (studioRoot: string): boolean => {
  const resolved = path.resolve(studioRoot);
  return (
    fs.existsSync(path.join(resolved, "package.json")) &&
    fs.existsSync(getStudioRunScriptPath(resolved))
  );
};

export const resolveStudioRoot = (
  options: {
    explicitEnv?: string | null;
    candidateRoots?: readonly string[];
  } = {}
): string | null => {
  const explicit =
    typeof options.explicitEnv === "string"
      ? options.explicitEnv.trim()
      : process.env.URDF_STUDIO_REPO?.trim() || "";
  if (explicit) {
    const resolved = path.resolve(explicit);
    return isStudioRepoRoot(resolved) ? resolved : null;
  }

  const candidates = options.candidateRoots ?? getDefaultStudioRootCandidates();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (isStudioRepoRoot(resolved)) {
      return resolved;
    }
  }

  return null;
};

const getStudioVenvPythonPath = (studioRoot: string): string =>
  process.platform === "win32"
    ? path.join(studioRoot, ".venv", "Scripts", "python.exe")
    : path.join(studioRoot, ".venv", "bin", "python3");

const isStudioSetupComplete = (studioRoot: string): boolean =>
  fs.existsSync(path.join(studioRoot, "node_modules")) &&
  fs.existsSync(getStudioVenvPythonPath(studioRoot));

export const getStudioInstallState = (
  options: {
    explicitEnv?: string | null;
    candidateRoots?: readonly string[];
  } = {}
): StudioInstallState => {
  const installRoot = getPreferredStudioInstallRoot(options.explicitEnv);
  const studioRoot = resolveStudioRoot(options);
  if (!studioRoot) {
    return {
      status: "missing-repo",
      studioRoot: null,
      installRoot,
      reason:
        "URDF Studio repo not found. Set URDF_STUDIO_REPO or install it next to i-love-urdf as urdf-studio-unprod or urdf-studio.",
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

export const isStudioReady = async (
  options: {
    webUrl?: string;
    apiHealthUrl?: string;
  } = {}
): Promise<boolean> => {
  const webUrl = options.webUrl ?? getStudioWebUrl();
  const apiHealthUrl = options.apiHealthUrl ?? getStudioApiHealthUrl();
  const [webReady, apiReady] = await Promise.all([fetchOk(webUrl), fetchOk(apiHealthUrl)]);
  return webReady && apiReady;
};

export const waitForStudioReady = async (
  options: {
    timeoutMs?: number;
    webUrl?: string;
    apiHealthUrl?: string;
  } = {}
): Promise<boolean> => {
  const timeoutMs = options.timeoutMs ?? STUDIO_START_TIMEOUT_MS;
  const webUrl = options.webUrl ?? getStudioWebUrl();
  const apiHealthUrl = options.apiHealthUrl ?? getStudioApiHealthUrl();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isStudioReady({ webUrl, apiHealthUrl })) {
      return true;
    }
    await sleep(STUDIO_POLL_INTERVAL_MS);
  }

  return false;
};

const createStudioClose = (child: ChildProcess, detached: boolean) => () => {
  if (child.killed) {
    return;
  }

  if (detached && typeof child.pid === "number" && child.pid > 0 && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // Fall back to targeting just the launcher process.
    }
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // Ignore cleanup failures.
  }
};

const stopManagedStudioProcess = (runtime: ManagedStudioRuntime) => {
  if (process.platform !== "win32") {
    try {
      process.kill(-runtime.pid, "SIGTERM");
      return;
    } catch {
      // Fall back to targeting the launcher process directly.
    }
  }

  try {
    process.kill(runtime.pid, "SIGTERM");
  } catch {
    // Ignore cleanup failures here and let the caller verify the final state.
  }
};

const waitForManagedStudioStop = async (
  runtime: ManagedStudioRuntime,
  timeoutMs = STUDIO_STOP_TIMEOUT_MS
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const stillRunning = isProcessActive(runtime.pid);
    const stillReady = await isStudioReady({
      webUrl: runtime.webUrl,
      apiHealthUrl: runtime.apiHealthUrl,
    });
    if (!stillRunning && !stillReady) {
      return true;
    }
    await sleep(STUDIO_POLL_INTERVAL_MS);
  }

  return !isProcessActive(runtime.pid) && !(await isStudioReady({
    webUrl: runtime.webUrl,
    apiHealthUrl: runtime.apiHealthUrl,
  }));
};

export const stopManagedStudio = async (): Promise<StopManagedStudioResult> => {
  const runtime = readManagedStudioRuntime();
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

export const ensureStudioRunning = async (
  options: {
    detached?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<EnsureStudioRunningResult> => {
  const webUrl = getStudioWebUrl();
  const apiHealthUrl = getStudioApiHealthUrl();

  if (await isStudioReady({ webUrl, apiHealthUrl })) {
    return {
      ok: true,
      handle: {
        startedHere: false,
        process: null,
        close: () => {
          void stopManagedStudio();
        },
      },
      studioRoot: null,
      webUrl,
      apiHealthUrl,
    };
  }

  const studioState = getStudioInstallState();
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
  let startupFailure: string | null = null;
  const child = spawn(process.execPath, [runScript], {
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

  const ready = await waitForStudioReady({
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

const collectCommandOutputLines = (output: string): string[] =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-8);

export const installStudio = (): InstallStudioResult => {
  const initialState = getStudioInstallState();
  let studioRoot = initialState.installRoot;
  let cloned = false;

  if (initialState.status === "ready") {
    studioRoot = initialState.studioRoot;
  } else if (initialState.status === "missing-repo") {
    fs.mkdirSync(path.dirname(studioRoot), { recursive: true });
    const clone = spawnSync("git", ["clone", "--depth", "1", DEFAULT_STUDIO_REPO_URL, studioRoot], {
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
  } else if (initialState.studioRoot) {
    studioRoot = initialState.studioRoot;
  }

  const { command, argsPrefix } = getNpmCommand();
  const setup = spawnSync(command, [...argsPrefix, "run", "setup"], {
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

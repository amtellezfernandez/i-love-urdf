import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as process from "node:process";
import type { AutoAutomationResult, LoadedSourceContext, ShellState } from "../commands/cliShellTypes";
import { quoteForPreview } from "../commands/cliShellConfig";
import { createOutputPanel } from "../commands/cliShellUi";
import { ensureStudioRunning, getStudioWebUrl } from "../studio/studioRuntime";
import {
  coerceIluSharedSessionSnapshot,
  ILU_SHARED_SESSION_SCHEMA,
  ILU_SHARED_SESSION_SCHEMA_VERSION,
  type IluSharedLoadedSource,
  type IluSharedSessionSnapshot,
} from "./sharedSessionContract";

export type { IluSharedLoadedSource, IluSharedSessionSnapshot } from "./sharedSessionContract";

const ILU_STATE_ROOT = path.join(os.homedir(), ".i-love-urdf");
const ILU_SESSION_ROOT = path.join(ILU_STATE_ROOT, "sessions");
const SESSION_METADATA_FILE = "session.json";
const RECENT_SESSION_POINTER_FILE = path.join(ILU_STATE_ROOT, "last-session.json");

type IluRecentSessionPointer = {
  sessionId: string;
  updatedAt: string;
};

const sanitizeHint = (hint: string): string => {
  const normalized = path.basename(hint || "robot.urdf").replace(/\.(urdf\.xacro|xacro|zip)$/i, ".urdf");
  const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, "-");
  return safe.toLowerCase().endsWith(".urdf") ? safe : `${safe || "robot"}.urdf`;
};

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

export const getIluSharedSessionRoot = (): string => {
  ensureDir(ILU_SESSION_ROOT);
  return ILU_SESSION_ROOT;
};

export const getIluSharedSessionDir = (sessionId: string): string =>
  path.join(getIluSharedSessionRoot(), sessionId);

export const getIluSharedSessionMetadataPath = (sessionId: string): string =>
  path.join(getIluSharedSessionDir(sessionId), SESSION_METADATA_FILE);

export const getIluSharedSessionWorkingUrdfPath = (
  sessionId: string,
  fileNameHint = "robot.urdf"
): string => path.join(getIluSharedSessionDir(sessionId), sanitizeHint(fileNameHint));

const writeMetadata = (snapshot: IluSharedSessionSnapshot) => {
  fs.writeFileSync(
    getIluSharedSessionMetadataPath(snapshot.sessionId),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8"
  );
};

const writeRecentSessionPointer = (snapshot: IluSharedSessionSnapshot) => {
  ensureDir(ILU_STATE_ROOT);
  const pointer: IluRecentSessionPointer = {
    sessionId: snapshot.sessionId,
    updatedAt: snapshot.updatedAt,
  };
  fs.writeFileSync(RECENT_SESSION_POINTER_FILE, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
};

const readRecentSessionPointer = (): IluRecentSessionPointer | null => {
  if (!fs.existsSync(RECENT_SESSION_POINTER_FILE)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(RECENT_SESSION_POINTER_FILE, "utf8")) as Partial<IluRecentSessionPointer>;
    if (typeof raw.sessionId !== "string" || raw.sessionId.trim().length === 0) {
      return null;
    }
    return {
      sessionId: raw.sessionId.trim(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return null;
  }
};

export const readIluSharedSession = (sessionId: string): IluSharedSessionSnapshot | null => {
  const metadataPath = getIluSharedSessionMetadataPath(sessionId);
  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    return coerceIluSharedSessionSnapshot(JSON.parse(fs.readFileSync(metadataPath, "utf8")));
  } catch {
    return null;
  }
};

export const rememberIluRecentSession = (snapshot: IluSharedSessionSnapshot) => {
  writeRecentSessionPointer(snapshot);
};

export const readLatestIluSharedSession = (): IluSharedSessionSnapshot | null => {
  const pointer = readRecentSessionPointer();
  if (pointer) {
    const pointedSnapshot = readIluSharedSession(pointer.sessionId);
    if (pointedSnapshot && fs.existsSync(pointedSnapshot.workingUrdfPath)) {
      return pointedSnapshot;
    }
  }

  if (!fs.existsSync(ILU_SESSION_ROOT)) {
    return null;
  }

  let latestSnapshot: IluSharedSessionSnapshot | null = null;
  for (const entry of fs.readdirSync(ILU_SESSION_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const snapshot = readIluSharedSession(entry.name);
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

export const writeIluSharedSession = (params: {
  sessionId?: string;
  urdfContent: string;
  fileNameHint?: string;
  loadedSource: IluSharedLoadedSource | null;
  lastUrdfPath: string;
}): IluSharedSessionSnapshot => {
  const sessionId = params.sessionId?.trim() || crypto.randomUUID();
  const sessionDir = getIluSharedSessionDir(sessionId);
  ensureDir(sessionDir);

  const previous = readIluSharedSession(sessionId);
  const workingUrdfPath = previous?.workingUrdfPath || getIluSharedSessionWorkingUrdfPath(sessionId, params.fileNameHint);
  fs.writeFileSync(workingUrdfPath, params.urdfContent, "utf8");

  const now = new Date().toISOString();
  const loadedSource = params.loadedSource
    ? {
        ...params.loadedSource,
        urdfPath: workingUrdfPath,
      }
    : null;

  const snapshot: IluSharedSessionSnapshot = {
    schema: ILU_SHARED_SESSION_SCHEMA,
    schemaVersion: ILU_SHARED_SESSION_SCHEMA_VERSION,
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

export const applySharedSessionSnapshotToState = (
  state: ShellState,
  snapshot: IluSharedSessionSnapshot,
  options: {
    resetVisualizerPrompt?: boolean;
  } = {}
) => {
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
        meshReferenceCorrectionCount: snapshot.loadedSource.meshReferenceCorrectionCount,
        meshReferenceUnresolvedCount: snapshot.loadedSource.meshReferenceUnresolvedCount,
      }
    : null;
};

const getSharedSessionFileHint = (state: Pick<ShellState, "loadedSource" | "lastUrdfPath">): string =>
  state.loadedSource?.repositoryUrdfPath ||
  state.loadedSource?.localPath ||
  state.lastUrdfPath ||
  "robot.urdf";

const getSharedSessionLoadedSource = (
  state: Pick<ShellState, "loadedSource">
): IluSharedLoadedSource | null => {
  const loadedSource = state.loadedSource as LoadedSourceContext | null;
  return loadedSource
      ? {
        source: loadedSource.source,
        urdfPath: loadedSource.urdfPath,
        localPath: loadedSource.localPath,
        githubRef: loadedSource.githubRef,
        githubRevision: loadedSource.githubRevision,
        repositoryUrdfPath: loadedSource.repositoryUrdfPath,
        meshReferenceCorrectionCount: loadedSource.meshReferenceCorrectionCount,
        meshReferenceUnresolvedCount: loadedSource.meshReferenceUnresolvedCount,
      }
    : null;
};

export const persistShellSharedSession = (
  state: ShellState,
  options: {
    sourceUrdfPath?: string;
    urdfContent?: string;
    fileNameHint?: string;
  } = {}
): IluSharedSessionSnapshot | null => {
  const sourceUrdfPath = options.sourceUrdfPath || state.loadedSource?.urdfPath || state.lastUrdfPath;
  const urdfContent =
    typeof options.urdfContent === "string"
      ? options.urdfContent
      : sourceUrdfPath && fs.existsSync(sourceUrdfPath)
        ? fs.readFileSync(sourceUrdfPath, "utf8")
        : null;

  if (!urdfContent) {
    return null;
  }

  const snapshot = writeIluSharedSession({
    sessionId: state.sharedSessionId,
    urdfContent,
    fileNameHint: options.fileNameHint || getSharedSessionFileHint(state),
    loadedSource: getSharedSessionLoadedSource(state),
    lastUrdfPath: sourceUrdfPath || state.lastUrdfPath || "",
  });
  applySharedSessionSnapshotToState(state, snapshot, { resetVisualizerPrompt: false });
  return snapshot;
};

export const attachShellToSharedSession = (
  state: ShellState,
  sessionId: string
): IluSharedSessionSnapshot => {
  const snapshot = readIluSharedSession(sessionId);
  if (!snapshot) {
    throw new Error(`Shared ilu session not found: ${sessionId}`);
  }
  if (!fs.existsSync(snapshot.workingUrdfPath)) {
    throw new Error(`Shared ilu working URDF is missing: ${snapshot.workingUrdfPath}`);
  }
  applySharedSessionSnapshotToState(state, snapshot);
  rememberIluRecentSession(snapshot);
  return snapshot;
};

export const buildStudioSessionUrl = (sessionId: string): string => {
  const studioUrl = new URL(getStudioWebUrl());
  studioUrl.searchParams.set("ilu_session", sessionId);
  return studioUrl.toString();
};

const openExternalUrl = (url: string): boolean => {
  const platform = process.platform;
  const opener =
    platform === "darwin"
      ? { command: "open", args: [url] }
      : platform === "win32"
        ? { command: "cmd", args: ["/c", "start", "", url] }
        : { command: "xdg-open", args: [url] };

  const result = spawnSync(opener.command, opener.args, {
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
};

export const openVisualizerForShellState = async (state: ShellState): Promise<AutoAutomationResult> => {
  const snapshot = persistShellSharedSession(state);
  if (!snapshot) {
    return {
      panel: createOutputPanel("visualizer", "load a repo or local path first"),
      notice: { kind: "info", text: "no loaded source yet" },
      clearSession: false,
    };
  }

  state.visualizerPromptResolved = true;
  const studioUrl = buildStudioSessionUrl(snapshot.sessionId);
  const started = await ensureStudioRunning({ detached: true });
  const panelLines = [
    `session ${snapshot.sessionId}`,
    `working urdf ${quoteForPreview(snapshot.workingUrdfPath)}`,
    `urdf studio ${studioUrl}`,
  ];

  if (started.ok === false) {
    panelLines.push(`launcher ${started.reason}`);
    panelLines.push("start URDF Studio manually, then open the URL above");
    return {
      panel: createOutputPanel("visualizer", panelLines.join("\n"), "info"),
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
    panelLines.push(`studio repo ${quoteForPreview(started.studioRoot)}`);
  }

  const opened = openExternalUrl(studioUrl);
  return {
    panel: createOutputPanel(
      "visualizer",
      panelLines.join("\n"),
      opened ? "success" : "info"
    ),
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

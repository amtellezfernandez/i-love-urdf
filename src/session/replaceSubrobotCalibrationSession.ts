import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as process from "node:process";
import { buildStudioSessionUrl, writeIluSharedSession } from "./sharedSession";
import { ensureStudioRunning, type EnsureStudioRunningResult } from "../studio/studioRuntime";

type StageCalibrationWorkspaceParams = {
  fileNameHint: string;
  hostUrdfPath: string;
  replacementUrdfPath: string;
  urdfContent: string;
};

export type StageCalibrationWorkspaceResult = {
  sessionId: string;
  sessionDir: string;
  workspaceRoot: string;
  workingUrdfPath: string;
  studioUrl: string;
  copiedFiles: number;
};

const ILU_STATE_ROOT = path.join(os.homedir(), ".i-love-urdf");
const CALIBRATION_ROOT = path.join(ILU_STATE_ROOT, "calibration-sessions");

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const normalizeRelativePath = (value: string): string =>
  value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");

const isAssetFile = (filePath: string): boolean => {
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

const findPackageRoot = (inputPath: string): string => {
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

const copyDirectoryRecursive = (
  sourceRoot: string,
  targetRoot: string
): number => {
  let copiedFiles = 0;
  const visit = (currentSourceDir: string) => {
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

export const stageReplaceSubrobotCalibrationSession = ({
  fileNameHint,
  hostUrdfPath,
  replacementUrdfPath,
  urdfContent,
}: StageCalibrationWorkspaceParams): StageCalibrationWorkspaceResult => {
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
    copiedFiles += copyDirectoryRecursive(
      replacementPackageRoot,
      path.join(workspaceRoot, replacementPackageDirName)
    );
  }

  const workingRelativePath = normalizeRelativePath(fileNameHint || "robot.urdf").replace(
    /\.(urdf\.xacro|xacro)$/i,
    ".urdf"
  );
  const workingUrdfPath = path.join(workspaceRoot, workingRelativePath);
  ensureDir(path.dirname(workingUrdfPath));
  fs.writeFileSync(workingUrdfPath, urdfContent, "utf8");

  const snapshot = writeIluSharedSession({
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
    studioUrl: buildStudioSessionUrl(snapshot.sessionId),
    copiedFiles,
  };
};

export const openStudioForReplaceSubrobotCalibration = async (
  sessionId: string,
  options: {
    focusJoint?: string;
    calibrateMode?: boolean;
  } = {}
): Promise<{
  studioUrl: string;
  opened: boolean;
  started: EnsureStudioRunningResult;
}> => {
  const studioUrl = buildStudioSessionUrl(sessionId, {
    focusJoint: options.focusJoint,
    calibrateMode: options.calibrateMode,
  });
  const started = await ensureStudioRunning({ detached: true });
  const opened = started.ok ? openExternalUrl(studioUrl) : false;
  return {
    studioUrl,
    opened,
    started,
  };
};

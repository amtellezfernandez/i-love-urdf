#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const buildScriptPath = path.join(root, "scripts", "build-package.mjs");
const buildManifestPath = path.join(root, "dist", ".build-manifest.json");
const distCliPath = path.join(root, "dist", "cli.js");
const typescriptCliPath = path.join(root, "node_modules", "typescript", "bin", "tsc");
const cliArgs = process.argv.slice(2);
const buildInputs = [
  path.join(root, "package.json"),
  path.join(root, "tsconfig.json"),
  path.join(root, "tsconfig.build.json"),
  path.join(root, "src"),
  path.join(root, "scripts"),
];

const getNewestMtimeMs = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  return fs.readdirSync(targetPath).reduce((newest, entry) => {
    const entryPath = path.join(targetPath, entry);
    return Math.max(newest, getNewestMtimeMs(entryPath));
  }, stats.mtimeMs);
};

const loadBuildManifest = () => {
  if (!fs.existsSync(buildManifestPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(buildManifestPath, "utf8"));
    if (!Array.isArray(parsed.outputs) || parsed.outputs.some((entry) => typeof entry !== "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const needsBuild = () => {
  const manifest = loadBuildManifest();
  if (!manifest || !fs.existsSync(distCliPath)) {
    return true;
  }

  const distStateIsComplete = manifest.outputs.every((relativePath) => {
    return fs.existsSync(path.join(root, "dist", relativePath));
  });
  if (!distStateIsComplete) {
    return true;
  }

  const buildStateMtimeMs = Math.min(fs.statSync(buildManifestPath).mtimeMs, fs.statSync(distCliPath).mtimeMs);
  const newestInputMtimeMs = buildInputs.reduce((newest, targetPath) => {
    return Math.max(newest, getNewestMtimeMs(targetPath));
  }, 0);

  return newestInputMtimeMs > buildStateMtimeMs;
};

if (!fs.existsSync(typescriptCliPath)) {
  console.error("Dependencies are not installed. Run `corepack enable` and `pnpm install` first.");
  process.exit(1);
}

// Keep repo-local CLI usage honest: rebuild whenever sources are newer than dist.
if (needsBuild()) {
  execFileSync(process.execPath, [buildScriptPath], {
    cwd: root,
    stdio: "inherit",
  });
}

const result = spawnSync(process.execPath, [distCliPath, ...cliArgs], {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

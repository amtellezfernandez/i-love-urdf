#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const buildScriptPath = path.join(root, "scripts", "build-package.mjs");
const distCliPath = path.join(root, "dist", "cli.js");
const typescriptCliPath = path.join(root, "node_modules", "typescript", "bin", "tsc");
const cliArgs = process.argv.slice(2);

if (!fs.existsSync(typescriptCliPath)) {
  console.error("Dependencies are not installed. Run `corepack enable` and `pnpm install` first.");
  process.exit(1);
}

if (!fs.existsSync(distCliPath)) {
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

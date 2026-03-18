#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const distDir = path.join(root, "dist");
const buildManifestPath = path.join(distDir, ".build-manifest.json");

const run = (command, args) => {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
};

const listFiles = (targetDir) => {
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  return fs.readdirSync(targetDir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    return [path.relative(distDir, entryPath)];
  });
};

fs.rmSync(distDir, { recursive: true, force: true });
run(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "./tsconfig.build.json"]);
run(process.execPath, [path.join(root, "scripts", "postbuild.mjs")]);

const outputs = listFiles(distDir)
  .filter((relativePath) => relativePath !== path.basename(buildManifestPath))
  .sort();

fs.writeFileSync(
  buildManifestPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      outputs,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

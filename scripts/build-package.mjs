#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const distDir = path.join(root, "dist");
const buildManifestPath = path.join(distDir, ".build-manifest.json");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const run = (command, args) => {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
};

const resolveLocalTscPath = () => path.join(root, "node_modules", "typescript", "bin", "tsc");

const runTypeScriptBuild = () => {
  const localTscPath = resolveLocalTscPath();
  if (fs.existsSync(localTscPath)) {
    run(process.execPath, [localTscPath, "-p", "./tsconfig.build.json"]);
    return;
  }

  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error(
      "TypeScript is not installed locally and npm_execpath is unavailable. Install dependencies first or rerun via npm."
    );
  }

  const typescriptVersion = packageJson.devDependencies?.typescript || "typescript";
  const nodeTypesVersion = packageJson.devDependencies?.["@types/node"] || "@types/node";

  console.error("Local TypeScript toolchain not found; bootstrapping temporary build dependencies via npm exec.");
  run(process.execPath, [
    npmExecPath,
    "exec",
    "--yes",
    `--package=typescript@${typescriptVersion}`,
    `--package=@types/node@${nodeTypesVersion}`,
    "--",
    "tsc",
    "-p",
    "./tsconfig.build.json",
  ]);
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
runTypeScriptBuild();
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

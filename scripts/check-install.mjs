#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageName = packageJson.name;
const packageVersion = packageJson.version;
const buildScriptPath = path.join(root, "scripts", "build-package.mjs");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-install-check-"));
const keepTemp = process.env.ILU_KEEP_INSTALL_TMP === "1";

const requiredInstalledFiles = [
  "dist/.build-manifest.json",
  "dist/index.js",
  "dist/browser.mjs",
  "dist/cli.js",
  "dist/mesh/meshFormats.constants.json",
  "dist/repository/localRepositoryInspection.js",
  "dist/xacro/xacroContract.constants.json",
  "dist/xacro/xacroContract.runtime.cjs",
  "dist/xacro/xacro_expand_runtime.py",
  "package.json",
];

const requiredPackedFiles = [
  "LICENSE",
  "README.md",
  ...requiredInstalledFiles,
];

const unexpectedPackedPrefixes = ["examples/", "scripts/", "src/", "tests/"];

const collectExportTargetPaths = (value) => {
  if (typeof value === "string") {
    return value.startsWith("./") ? [value.slice(2)] : [];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Array.from(
    new Set(Object.values(value).flatMap((entry) => collectExportTargetPaths(entry)))
  );
};

const buildEnv = (envOverrides = undefined, { scrubNpmEnv = false } = {}) => {
  const env = { ...process.env, ...(envOverrides ?? {}) };

  if (scrubNpmEnv) {
    for (const key of Object.keys(env)) {
      if (key.startsWith("npm_") || key.startsWith("npm_config_")) {
        delete env[key];
      }
    }
  }

  return env;
};

const run = (command, args, options = {}) => {
  const result = execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: buildEnv(options.env, { scrubNpmEnv: options.scrubNpmEnv === true }),
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
  });

  return options.capture ? result.trim() : undefined;
};

const runNpm = (args, options = {}) => run("npm", args, { ...options, scrubNpmEnv: true });

const expect = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createDir = (name) => {
  const directory = path.join(tempRoot, name);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};

const createPrefix = (name) => {
  const prefix = createDir(`${name}-prefix`);
  const cache = createDir(`${name}-cache`);
  return { prefix, cache };
};

const getInstalledPackageRoot = (prefix) => {
  const globalRoot = runNpm(["root", "-g", "--prefix", prefix], { capture: true });
  return path.join(globalRoot, packageName);
};

const getInstalledCliPath = (prefix) => {
  if (process.platform === "win32") {
    return path.join(prefix, "ilu.cmd");
  }

  return path.join(prefix, "bin", "ilu");
};

const assertInstalledPackage = (prefix, label) => {
  const installedRoot = getInstalledPackageRoot(prefix);
  expect(fs.existsSync(installedRoot), `${label}: missing installed package root`);

  const installedPackageJson = JSON.parse(
    fs.readFileSync(path.join(installedRoot, "package.json"), "utf8")
  );
  expect(
    installedPackageJson.version === packageVersion,
    `${label}: installed package version mismatch`
  );

  for (const exportTarget of collectExportTargetPaths(installedPackageJson.exports)) {
    expect(
      fs.existsSync(path.join(installedRoot, exportTarget)),
      `${label}: missing export target ${exportTarget}`
    );
  }

  for (const relativePath of requiredInstalledFiles) {
    expect(
      fs.existsSync(path.join(installedRoot, relativePath)),
      `${label}: missing installed file ${relativePath}`
    );
  }

  const cliPath = getInstalledCliPath(prefix);
  expect(fs.existsSync(cliPath), `${label}: missing installed CLI binary`);

  const helpText = run(cliPath, ["--help"], {
    capture: true,
    env: { NO_COLOR: "1" },
  });
  expect(helpText.includes("ILU CLI"), `${label}: CLI help header missing`);
  expect(helpText.includes("load-source"), `${label}: CLI help command list missing`);
};

const createGitSnapshot = () => {
  const snapshotDir = path.join(tempRoot, "git-snapshot");
  const excludedTopLevel = new Set([".git", "node_modules"]);

  fs.cpSync(root, snapshotDir, {
    recursive: true,
    filter(sourcePath) {
      const relativePath = path.relative(root, sourcePath);
      if (!relativePath) {
        return true;
      }

      const topLevel = relativePath.split(path.sep)[0];
      return !excludedTopLevel.has(topLevel);
    },
  });

  run("git", ["init"], { cwd: snapshotDir });
  run("git", ["add", "."], { cwd: snapshotDir });
  run(
    "git",
    [
      "-c",
      "user.name=Install Check",
      "-c",
      "user.email=install-check@example.com",
      "commit",
      "-m",
      "install snapshot",
    ],
    { cwd: snapshotDir }
  );

  return snapshotDir;
};

const verifyPackedFiles = (packMetadata) => {
  const packedPaths = new Set(packMetadata.files.map((entry) => entry.path));

  for (const relativePath of requiredPackedFiles) {
    expect(packedPaths.has(relativePath), `npm pack: missing ${relativePath}`);
  }

  for (const relativePath of packedPaths) {
    expect(
      !unexpectedPackedPrefixes.some((prefix) => relativePath.startsWith(prefix)),
      `npm pack: unexpected file ${relativePath}`
    );
  }

  for (const exportTarget of collectExportTargetPaths(packageJson.exports)) {
    expect(packedPaths.has(exportTarget), `npm pack: missing export target ${exportTarget}`);
  }
};

const main = () => {
  try {
    console.log("Rebuilding dist before install checks...");
    run(process.execPath, [buildScriptPath]);

    console.log("Checking npm pack payload...");
    const packDir = createDir("pack");
    const packOutput = runNpm(["pack", "--json", "--pack-destination", packDir], {
      capture: true,
    });
    const [packMetadata] = JSON.parse(packOutput);
    expect(packMetadata?.filename, "npm pack did not return a tarball filename");
    verifyPackedFiles(packMetadata);
    const tarballPath = path.join(packDir, packMetadata.filename);
    expect(fs.existsSync(tarballPath), "npm pack tarball was not created");

    console.log("Checking repeated git global installs...");
    const snapshotDir = createGitSnapshot();
    const gitInstall = createPrefix("git");
    const gitSpec = `git+file://${snapshotDir}`;
    runNpm([
      "install",
      "-g",
      "--prefix",
      gitInstall.prefix,
      "--cache",
      gitInstall.cache,
      "--install-links=true",
      gitSpec,
    ]);
    runNpm([
      "install",
      "-g",
      "--prefix",
      gitInstall.prefix,
      "--cache",
      gitInstall.cache,
      "--install-links=true",
      gitSpec,
    ]);
    assertInstalledPackage(gitInstall.prefix, "git install");

    console.log("Checking tarball global installs...");
    const tarballInstall = createPrefix("tarball");
    runNpm([
      "install",
      "-g",
      "--prefix",
      tarballInstall.prefix,
      "--cache",
      tarballInstall.cache,
      tarballPath,
    ]);
    runNpm([
      "install",
      "-g",
      "--prefix",
      tarballInstall.prefix,
      "--cache",
      tarballInstall.cache,
      tarballPath,
    ]);
    assertInstalledPackage(tarballInstall.prefix, "tarball install");

    console.log("Checking local checkout global installs...");
    const localInstall = createPrefix("local");
    runNpm([
      "install",
      "-g",
      "--prefix",
      localInstall.prefix,
      "--cache",
      localInstall.cache,
      ".",
    ]);
    runNpm([
      "install",
      "-g",
      "--prefix",
      localInstall.prefix,
      "--cache",
      localInstall.cache,
      ".",
    ]);
    assertInstalledPackage(localInstall.prefix, "local install");

    console.log("ilu install checks passed.");
  } finally {
    if (keepTemp) {
      console.error(`Kept install-check temp dir: ${tempRoot}`);
    } else {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
};

main();

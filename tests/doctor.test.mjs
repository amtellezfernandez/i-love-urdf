import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testsDir, "..");
const cliPath = path.join(rootDir, "dist", "cli.js");

const runDoctor = (args = []) =>
  spawnSync(process.execPath, [cliPath, "doctor", ...args], {
    cwd: rootDir,
    encoding: "utf8",
  });

test("ilu doctor --json emits a stable diagnostics contract", () => {
  const result = runDoctor(["--json"]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");

  const report = JSON.parse(result.stdout);
  assert.equal(typeof report.generatedAt, "string");
  assert.equal(typeof report.ilu.version, "string");
  assert.equal(typeof report.ilu.installSpec, "string");
  assert.equal(typeof report.runtime.nodeVersion, "string");
  assert.equal(typeof report.runtime.platform, "string");
  assert.equal(typeof report.runtime.arch, "string");
  assert.equal(typeof report.runtime.stdinTty, "boolean");
  assert.equal(typeof report.runtime.stdoutTty, "boolean");
  assert.equal(typeof report.support.nodeSupported, "boolean");
  assert.equal(typeof report.support.platformSupported, "boolean");
  assert.ok(["release-gated", "ci-gated", "unsupported"].includes(report.support.platformTier));
  assert.ok(Array.isArray(report.support.notes));
  assert.equal(typeof report.github.authenticated, "boolean");
  assert.equal(typeof report.github.envTokenConfigured, "boolean");
  assert.equal(typeof report.github.ghCliAvailable, "boolean");
  assert.equal(typeof report.github.ghCliAuthenticated, "boolean");
  assert.equal(typeof report.xacro.available, "boolean");
  assert.equal(typeof report.xacro.pythonExecutable, "string");
});

test("ilu help doctor shows doctor usage", () => {
  const result = spawnSync(process.execPath, [cliPath, "help", "doctor"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Usage$/m);
  assert.match(result.stdout, /^  ilu doctor$/m);
  assert.match(result.stdout, /^  ilu doctor --json$/m);
});

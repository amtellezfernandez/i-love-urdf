import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testsDir, "..");
const cliPath = path.join(rootDir, "dist", "cli.js");

const baseUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="base_robot">
  <link name="base_link"/>
</robot>`;

const toolUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="tool_robot">
  <link name="tool_base"/>
</robot>`;

test("assemble writes an ilu assembly session and returns a Studio assembly URL", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-assemble-"));
  const stateRoot = path.join(tempDir, "state");

  try {
    const baseDir = path.join(tempDir, "base_pkg");
    const toolDir = path.join(tempDir, "tool_pkg");
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(toolDir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, "package.xml"), "<package><name>base_pkg</name></package>\n", "utf8");
    fs.writeFileSync(path.join(toolDir, "package.xml"), "<package><name>tool_pkg</name></package>\n", "utf8");
    const basePath = path.join(baseDir, "base.urdf");
    const toolPath = path.join(toolDir, "tool.urdf");
    fs.writeFileSync(basePath, baseUrdf, "utf8");
    fs.writeFileSync(toolPath, toolUrdf, "utf8");

    const result = spawnSync(
      process.execPath,
      [cliPath, "assemble", "--urdf", basePath, "--attach", toolPath, "--name", "bench assembly"],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          HOME: tempDir,
          ILU_STATE_ROOT: stateRoot,
        },
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");

    const payload = JSON.parse(result.stdout);
    assert.equal(typeof payload.sessionId, "string");
    assert.equal(payload.robotCount, 2);
    assert.equal(Array.isArray(payload.selectedPaths), true);
    assert.equal(payload.selectedPaths.length, 2);
    assert.equal(typeof payload.workspaceRoot, "string");
    assert.match(payload.studioUrl, /\bilu_assembly=/);
    assert.equal(typeof payload.visualizerStart.ok, "boolean");

    const metadataPath = path.join(payload.sessionDir, "assembly-session.json");
    assert.equal(fs.existsSync(metadataPath), true);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    assert.equal(metadata.schema, "ilu-assembly-session");
    assert.equal(metadata.schemaVersion, 1);
    assert.equal(metadata.label, "bench assembly");
    assert.deepEqual(metadata.selectedPaths, payload.selectedPaths);

    const workspaceFiles = path.join(payload.sessionDir, "files");
    assert.equal(payload.workspaceRoot, workspaceFiles);
    assert.equal(fs.existsSync(path.join(workspaceFiles, metadata.robots[0].sourcePrefix, "base.urdf")), true);
    assert.equal(fs.existsSync(path.join(workspaceFiles, metadata.robots[1].sourcePrefix, "tool.urdf")), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("line shell assemble reports the shared workspace explicitly", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-shell-assemble-"));
  const stateRoot = path.join(tempDir, "state");

  try {
    const baseDir = path.join(tempDir, "base_pkg");
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, "package.xml"), "<package><name>base_pkg</name></package>\n", "utf8");
    const basePath = path.join(baseDir, "base.urdf");
    fs.writeFileSync(basePath, baseUrdf, "utf8");

    const result = spawnSync(
      process.execPath,
      [cliPath, "shell"],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          HOME: tempDir,
          ILU_STATE_ROOT: stateRoot,
          ILU_DISABLE_UPDATE_CHECK: "1",
        },
        input: `/assemble\n${basePath}\n/run\n/exit\n`,
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /assembly local working copy ready/i);
    assert.match(result.stdout, /workspace .*assembly-sessions/i);
    assert.match(result.stdout, /robots 1 robot/i);
    assert.match(result.stdout, /selected .*base\/base\.urdf/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

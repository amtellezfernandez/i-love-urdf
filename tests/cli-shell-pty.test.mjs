import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { runPtyShellSession, supportsPtyShellTests } from "./helpers/ptyShell.mjs";

const ptyTest = supportsPtyShellTests ? test : test.skip;

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

ptyTest("TTY shell keeps slash completion on Tab", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: "/v" },
      { delayMs: 300, data: "\t" },
      { delayMs: 300, data: "\r" },
      { delayMs: 500, data: "\u0003" },
    ],
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /\/validate/);
  assert.match(result.sanitizedOutput, /paste urdf file path/i);
});

ptyTest("TTY shell lets arrows pick a candidate entrypoint", async () => {
  const tempDir = createTempDir("ilu-pty-candidates-");
  fs.writeFileSync(
    path.join(tempDir, "a.urdf"),
    '<robot name="a"><link name="base"/></robot>'
  );
  fs.writeFileSync(
    path.join(tempDir, "b.urdf"),
    '<robot name="b"><link name="base"/></robot>'
  );

  try {
    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
      },
      steps: [
        { delayMs: 150, data: `${tempDir}\n` },
        { delayMs: 1_250, data: "\u001b[B" },
        { delayMs: 350, data: "\r" },
        { delayMs: 900, data: "\u0003" },
      ],
      timeoutMs: 10_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /selected\s+b\.urdf/);
    assert.match(result.sanitizedOutput, /entry\s+b\.urdf/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ptyTest("TTY shell accepts the startup update prompt with Enter", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_UPDATE_LATEST_VERSION: "99.0.0",
      ILU_UPDATE_DRY_RUN: "1",
      ILU_DISABLE_UPDATE_CHECK_CACHE: "1",
    },
    steps: [
      { delayMs: 1_100, data: "\r" },
      { delayMs: 900, data: "\u0003" },
    ],
    timeoutMs: 10_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /update available .*99\.0\.0/i);
  assert.match(result.sanitizedOutput, /installing the latest ilu release/i);
  assert.match(result.sanitizedOutput, /npm install -g --install-links=true/i);
});

ptyTest("TTY shell exposes and accepts the repair recommendation prompt", async () => {
  const tempDir = createTempDir("ilu-pty-repair-");
  const brokenUrdfPath = path.join(tempDir, "broken.urdf");
  fs.writeFileSync(
    brokenUrdfPath,
    '<robot name="broken"><link name="base"><visual><geometry><mesh filename="meshes\\\\part.stl"/></geometry></visual></link></robot>'
  );

  try {
    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
      },
      steps: [
        { delayMs: 150, data: `${brokenUrdfPath}\n` },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "\u0003" },
      ],
      timeoutMs: 10_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /repair mesh paths now\?/i);
    assert.match(result.sanitizedOutput, /repairing mesh paths/i);
    assert.match(result.sanitizedOutput, /working urdf .*broken\.urdf/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ptyTest("TTY shell keeps repair recommendations modal until Enter or Esc", async () => {
  const tempDir = createTempDir("ilu-pty-modal-");
  const brokenUrdfPath = path.join(tempDir, "broken.urdf");
  fs.writeFileSync(
    brokenUrdfPath,
    '<robot name="broken"><link name="base"><visual><geometry><mesh filename="meshes\\\\part.stl"/></geometry></visual></link></robot>'
  );

  try {
    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
      },
      steps: [
        { delayMs: 150, data: `${brokenUrdfPath}\n` },
        { delayMs: 1_100, data: "/" },
        { delayMs: 450, data: "\u0003" },
      ],
      timeoutMs: 10_000,
    });

    assert.equal(result.code, 0);
    const promptMatches = result.sanitizedOutput.match(/repair mesh paths now\?/gi) ?? [];
    assert.ok(promptMatches.length >= 2, "expected the repair prompt to persist after typed input");
    assert.match(result.sanitizedOutput, /\[Enter\]\s+Repair now\s+\[Esc\]\s+Not now/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ptyTest("TTY shell offers a remaining-issues review after a partial repair", async () => {
  const tempDir = createTempDir("ilu-pty-review-");
  const brokenUrdfPath = path.join(tempDir, "broken.urdf");
  fs.writeFileSync(
    brokenUrdfPath,
    '<robot name="broken"><link name="base"><inertial><mass value="0"/><origin xyz="0 0 0"/><inertia ixx="1" ixy="0" ixz="0" iyy="1" iyz="0" izz="1"/></inertial><visual><geometry><mesh filename="meshes\\\\part.stl"/></geometry></visual></link></robot>'
  );

  try {
    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
      },
      steps: [
        { delayMs: 150, data: `${brokenUrdfPath}\n` },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "\u0003" },
      ],
      timeoutMs: 12_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /review the remaining issues now\?/i);
    assert.match(result.sanitizedOutput, /\[Enter\]\s+Review now/i);
    assert.match(result.sanitizedOutput, /reviewing the remaining issues\.\.\./i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ptyTest("TTY shell exits cleanly on Ctrl+C", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [{ delayMs: 250, data: "\u0003" }],
  });

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.match(result.sanitizedOutput, /ilu interactive urdf shell/i);
});

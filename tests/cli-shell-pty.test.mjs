import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { runPtyShellSession, supportsPtyShellTests } from "./helpers/ptyShell.mjs";
import { rootDir } from "./helpers/loadDist.mjs";

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
        { delayMs: 1_250, data: "\r" },
        { delayMs: 600, data: "\u001b[B" },
        { delayMs: 350, data: "\r" },
        { delayMs: 600, data: "\u0003" },
      ],
      timeoutMs: 10_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /\/work-one/);
    assert.match(result.sanitizedOutput, /selected \/work-one/i);
    assert.match(result.sanitizedOutput, /opening the robot picker/i);
    assert.match(result.sanitizedOutput, /arrows choose a match, Enter loads it/i);
    assert.match(result.sanitizedOutput, /selected b\.urdf/i);
    assert.match(result.sanitizedOutput, /entry\s+b\.urdf/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ptyTest("TTY shell lets work-one bypass the repo-fixes review prompt", async () => {
  const tempDir = createTempDir("ilu-pty-repo-fixes-");
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
        ILU_DISABLE_STUDIO_THUMBNAILS: "1",
      },
      steps: [
        { delayMs: 150, data: `${tempDir}\n` },
        { delayMs: 1_200, data: "\u001b[B" },
        { delayMs: 200, data: "\u001b[B" },
        { delayMs: 300, data: "\r" },
        { delayMs: 1_100, data: "/w" },
        { delayMs: 250, data: "\t" },
        { delayMs: 250, data: "\r" },
        { delayMs: 700, data: "\u001b[B" },
        { delayMs: 250, data: "\r" },
        { delayMs: 900, data: "\u0003" },
      ],
      timeoutMs: 12_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /selected \/repo-fixes/i);
    assert.match(result.sanitizedOutput, /apply shared safe fixes across the repo now\?/i);
    assert.match(result.sanitizedOutput, /opening the robot picker/i);
    assert.match(result.sanitizedOutput, /entry\s+b\.urdf/i);
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
  assert.match(result.sanitizedOutput, /npm install -g --ignore-scripts --install-links=true/i);
});

ptyTest("TTY shell resumes the most recent session on startup", async () => {
  const tempHome = createTempDir("ilu-pty-resume-home-");
  const urdfPath = path.resolve("examples", "orientation-card", "research_wheeled_y_up.urdf");
  const seedResult = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        import fs from "node:fs";
        import path from "node:path";
        import { writeIluSharedSession } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "dist", "session", "sharedSession.js")).href)};
        const urdfPath = ${JSON.stringify(urdfPath)};
        const urdfContent = fs.readFileSync(urdfPath, "utf8");
        const snapshot = writeIluSharedSession({
          urdfContent,
          fileNameHint: "research_wheeled_y_up.urdf",
          lastUrdfPath: urdfPath,
          loadedSource: {
            source: "local-file",
            urdfPath,
            localPath: urdfPath,
          },
        });
        process.stdout.write(snapshot.sessionId);
      `,
    ],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        HOME: tempHome,
      },
      encoding: "utf8",
    }
  );

  try {
    assert.equal(seedResult.status, 0);
    const sessionId = seedResult.stdout.trim();
    assert.match(sessionId, /^[a-f0-9-]+$/i);

    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
        HOME: tempHome,
      },
      steps: [
        { delayMs: 350, data: "\r" },
        { delayMs: 850, data: "\u0003" },
      ],
      timeoutMs: 8_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, new RegExp(`resume ${sessionId}`));
    assert.match(result.sanitizedOutput, new RegExp(`resumed session ${sessionId}`));
    assert.match(result.sanitizedOutput, /working urdf .*research_wheeled_y_up\.urdf/i);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
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

ptyTest("TTY shell lets slash commands bypass recommendation prompts", async () => {
  const yUpUrdfPath = path.resolve("examples", "orientation-card", "research_wheeled_y_up.urdf");
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: `${yUpUrdfPath}\n` },
      { delayMs: 1_100, data: "/orientation" },
      { delayMs: 250, data: "\r" },
      { delayMs: 1_100, data: "\u0003" },
    ],
    timeoutMs: 10_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /align orientation to \+z-up \/ \+x-forward now\?/i);
  assert.match(result.sanitizedOutput, /\/orientation/i);
  assert.match(result.sanitizedOutput, /press Enter or type \/run/i);
});

ptyTest("TTY shell applies /align without opening the URDF manually", async () => {
  const yUpUrdfPath = path.resolve("examples", "orientation-card", "research_wheeled_y_up.urdf");
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: `${yUpUrdfPath}\n` },
      { delayMs: 1_100, data: "/align" },
      { delayMs: 250, data: "\r" },
      { delayMs: 1_100, data: "\u0003" },
    ],
    timeoutMs: 10_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /aligning orientation/i);
  assert.match(result.sanitizedOutput, /\/align/i);
  assert.match(result.sanitizedOutput, /working urdf .*research_wheeled_y_up\.urdf/i);
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
  assert.match(result.sanitizedOutput, /urdf shell/i);
});

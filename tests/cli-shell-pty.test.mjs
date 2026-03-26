import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { runPtyShellSession, supportsPtyShellTests } from "./helpers/ptyShell.mjs";
import { rootDir } from "./helpers/loadDist.mjs";

const ptyTest = supportsPtyShellTests ? test : test.skip;

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const missingStudioRepoPath = path.join(os.tmpdir(), "ilu-missing-studio-repo");

const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const startHttpServer = () =>
  new Promise((resolve) => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

ptyTest("TTY shell keeps slash completion on Tab", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: "\r" },
      { delayMs: 150, data: "/v" },
      { delayMs: 300, data: "\t" },
      { delayMs: 300, data: "\r" },
      { delayMs: 500, data: "\u0003" },
    ],
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /\/validate/);
  assert.match(result.sanitizedOutput, /set \/urdf/i);
});

ptyTest("TTY shell asks for a startup mode before loading", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [{ delayMs: 350, data: "\u0003" }],
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /1 single/i);
  assert.match(result.sanitizedOutput, /single/i);
  assert.match(result.sanitizedOutput, /assembly/i);
  assert.match(result.sanitizedOutput, /substitute/i);
  assert.match(result.sanitizedOutput, /preview/i);
});

ptyTest("TTY startup mode selector uses arrows, blocks free typing, and auto-fills the mode command", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: "\u001b[B" },
      { delayMs: 250, data: "x" },
      { delayMs: 350, data: "\u0003" },
    ],
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /\/assembly-mode/i);
  assert.match(result.sanitizedOutput, /> assembly\s+combine robots/i);
  assert.doesNotMatch(result.sanitizedOutput, /\/assembly-modex/i);
});

ptyTest("TTY startup mode selector reaches preview with repeated down arrows", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: "\u001b[B" },
      { delayMs: 200, data: "\u001b[B" },
      { delayMs: 200, data: "\u001b[B" },
      { delayMs: 350, data: "\u0003" },
    ],
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /\/preview-mode/i);
  assert.match(result.sanitizedOutput, /> preview\s+gallery output/i);
});

ptyTest("TTY substitute mode starts with a compact source prompt", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: "\u001b[B" },
      { delayMs: 200, data: "\u001b[B" },
      { delayMs: 250, data: "\r" },
      { delayMs: 350, data: "\u0003" },
    ],
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /\/substitute-mode/i);
  assert.match(result.sanitizedOutput, /paste or drop 1 source file to replace/i);
  assert.doesNotMatch(result.sanitizedOutput, /source\s+none yet/i);
  assert.doesNotMatch(result.sanitizedOutput, /embedded arm or subrobot you want to replace/i);
});

ptyTest("TTY assembly mode starts with a compact base-source prompt", async () => {
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: "\u001b[B" },
      { delayMs: 250, data: "\r" },
      { delayMs: 350, data: "\u0003" },
    ],
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /\/assembly-mode/i);
  assert.match(result.sanitizedOutput, /paste or drop 1 base source file/i);
  assert.doesNotMatch(result.sanitizedOutput, /source\s+none yet/i);
  assert.doesNotMatch(result.sanitizedOutput, /shared local assembly workspace from one or more urdf files/i);
});

ptyTest("TTY substitute mode asks for the replacement source after the first file", async () => {
  const tempDir = createTempDir("ilu-pty-substitute-");
  const hostUrdfPath = path.join(tempDir, "host.urdf");
  fs.writeFileSync(hostUrdfPath, '<robot name="host"><link name="base"/></robot>');

  try {
    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
      },
      steps: [
        { delayMs: 150, data: "\u001b[B" },
        { delayMs: 200, data: "\u001b[B" },
        { delayMs: 250, data: "\r" },
        { delayMs: 250, data: `${hostUrdfPath}\n` },
        { delayMs: 500, data: "\u0003" },
      ],
      timeoutMs: 8_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /paste or drop 1 replacement source file/i);
    assert.doesNotMatch(result.sanitizedOutput, /replacement urdf file to import into the host robot/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
        URDF_STUDIO_REPO: missingStudioRepoPath,
      },
      steps: [
        { delayMs: 150, data: "\r" },
        { delayMs: 250, data: `${tempDir}\n` },
        { delayMs: 1_250, data: "\r" },
        { delayMs: 600, data: "\u001b[B" },
        { delayMs: 350, data: "\r" },
        { delayMs: 600, data: "\u0003" },
      ],
      timeoutMs: 12_000,
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
        { delayMs: 150, data: "\r" },
        { delayMs: 250, data: `${tempDir}\n` },
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
    timeoutMs: 12_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /update available .*99\.0\.0/i);
  assert.match(result.sanitizedOutput, /installing the latest ilu release/i);
  assert.match(result.sanitizedOutput, /npm install -g --ignore-scripts --install-links=true/i);
});

ptyTest("TTY shell starts clean even when a previous session exists", async () => {
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
        { delayMs: 350, data: "" },
        { delayMs: 850, data: "\u0003" },
      ],
      timeoutMs: 8_000,
    });

    assert.equal(result.code, 0);
    assert.doesNotMatch(result.sanitizedOutput, new RegExp(`resume ${sessionId}`));
    assert.doesNotMatch(result.sanitizedOutput, new RegExp(`resumed session ${sessionId}`));
    assert.match(result.sanitizedOutput, /1 single\s+2 assembly\s+3 substitute/i);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

ptyTest("TTY shell asks to open URDF Studio before the repair recommendation", async () => {
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
        URDF_STUDIO_REPO: missingStudioRepoPath,
      },
      steps: [
        { delayMs: 150, data: "\r" },
        { delayMs: 150, data: `${brokenUrdfPath}\n` },
        { delayMs: 1_100, data: "\u001b" },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "\u0003" },
        { delayMs: 900, data: "2" },
      ],
      timeoutMs: 10_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /open URDF Studio before repairing mesh paths\?/i);
    assert.match(result.sanitizedOutput, /1\.\s+Open Studio/i);
    assert.match(result.sanitizedOutput, /2\.\s+Continue here/i);
    assert.match(result.sanitizedOutput, /\[Enter\]\s+confirm/i);
    assert.match(result.sanitizedOutput, /\[Esc\]\s+Continue here/i);
    assert.match(result.sanitizedOutput, /repair mesh paths now\?/i);
    assert.match(result.sanitizedOutput, /repairing mesh paths/i);
    assert.match(result.sanitizedOutput, /source\s+file .*broken\.urdf/i);
    assert.doesNotMatch(result.sanitizedOutput, /health check passed/i);
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
      { delayMs: 150, data: "\r" },
      { delayMs: 150, data: `${yUpUrdfPath}\n` },
      { delayMs: 1_100, data: "/orientation" },
      { delayMs: 250, data: "\r" },
      { delayMs: 1_100, data: "\u0003" },
    ],
    timeoutMs: 10_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /align orientation to the default target \+z-up \/ \+x-forward now\?/i);
  assert.match(result.sanitizedOutput, /\/orientation/i);
  assert.match(result.sanitizedOutput, /\[↑↓\] move\s+\[Enter\] confirm\s+\[Esc\] Not now/i);
});

ptyTest("TTY shell offers Studio install when the visualizer is missing", async () => {
  const yUpUrdfPath = path.resolve("examples", "orientation-card", "research_wheeled_y_up.urdf");
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
      URDF_STUDIO_REPO: missingStudioRepoPath,
      URDF_STUDIO_URL: "http://127.0.0.1:65534/",
      URDF_STUDIO_API_URL: "http://127.0.0.1:65535/health",
    },
    steps: [
      { delayMs: 150, data: "\r" },
      { delayMs: 150, data: `${yUpUrdfPath}\n` },
      { delayMs: 1_100, data: "\r" },
      { delayMs: 2_000, data: "2" },
      { delayMs: 1_000, data: "\u0003" },
    ],
    timeoutMs: 14_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /open URDF Studio before aligning orientation\?/i);
  assert.match(result.sanitizedOutput, /1\.\s+Open Studio/i);
  assert.match(result.sanitizedOutput, /2\.\s+Continue here/i);
  assert.match(result.sanitizedOutput, /\[Enter\]\s+confirm/i);
  assert.match(result.sanitizedOutput, /\[Esc\]\s+Continue here/i);
  assert.match(result.sanitizedOutput, /install URDF Studio to visualize your modifications\?/i);
  assert.match(result.sanitizedOutput, /1\.\s+Install Studio/i);
  assert.match(result.sanitizedOutput, /2\.\s+Not now/i);
  assert.doesNotMatch(result.sanitizedOutput, /loaded the source|source loaded\. review the checks/i);
});

ptyTest("TTY shell accepts the suggested orientation fix after skipping URDF Studio", async () => {
  const yUpUrdfPath = path.resolve("examples", "orientation-card", "research_wheeled_y_up.urdf");
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
      URDF_STUDIO_REPO: missingStudioRepoPath,
    },
    steps: [
      { delayMs: 150, data: "\r" },
      { delayMs: 150, data: `${yUpUrdfPath}\n` },
      { delayMs: 1_100, data: "\u001b[B" },
      { delayMs: 500, data: "\r" },
      { delayMs: 1_100, data: "1" },
        { delayMs: 1_100, data: "\u0003" },
        { delayMs: 900, data: "2" },
      ],
      timeoutMs: 12_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /open URDF Studio before aligning orientation\?/i);
  assert.match(result.sanitizedOutput, /1\.\s+Open Studio/i);
  assert.match(result.sanitizedOutput, /2\.\s+Continue here/i);
  assert.match(result.sanitizedOutput, /align orientation to the default target \+z-up \/ \+x-forward now\?/i);
  assert.match(result.sanitizedOutput, /1\.\s+Align now/i);
  assert.match(result.sanitizedOutput, /2\.\s+Not now/i);
  assert.match(result.sanitizedOutput, /aligning orientation/i);
  assert.match(result.sanitizedOutput, /working urdf .*research_wheeled_y_up\.urdf/i);
  assert.doesNotMatch(result.sanitizedOutput, /loaded the source|source loaded\. review the checks/i);
  assert.doesNotMatch(result.sanitizedOutput, /updated the working copy|working copy ready/i);
  assert.doesNotMatch(result.sanitizedOutput, /opened URDF Studio for the current session/i);
});

ptyTest("TTY shell asks whether to quit URDF Studio on Ctrl+C when Studio is open", async () => {
  const tempDir = createTempDir("ilu-pty-visualizer-exit-");
  const runtimeFile = path.join(tempDir, "studio-runtime.json");
  const managedStudio = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
    detached: true,
    stdio: "ignore",
  });
  managedStudio.unref();
  fs.writeFileSync(
    runtimeFile,
    `${JSON.stringify(
      {
        pid: managedStudio.pid,
        studioRoot: tempDir,
        webUrl: "http://127.0.0.1:1/",
        apiHealthUrl: "http://127.0.0.1:2/health",
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const webServer = await startHttpServer();
  const apiServer = await startHttpServer();
  const webAddress = webServer.address();
  const apiAddress = apiServer.address();
  const yUpUrdfPath = path.resolve("examples", "orientation-card", "research_wheeled_y_up.urdf");

  try {
    assert.equal(typeof webAddress === "object" && webAddress ? webAddress.port > 0 : false, true);
    assert.equal(typeof apiAddress === "object" && apiAddress ? apiAddress.port > 0 : false, true);

    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
        ILU_STUDIO_RUNTIME_FILE: runtimeFile,
        URDF_STUDIO_URL: `http://127.0.0.1:${webAddress.port}/`,
        URDF_STUDIO_API_URL: `http://127.0.0.1:${apiAddress.port}/health`,
      },
      steps: [
        { delayMs: 150, data: "\r" },
        { delayMs: 150, data: `${yUpUrdfPath}\n` },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "\u0003" },
        { delayMs: 900, data: "\r" },
      ],
      timeoutMs: 12_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /leave ilu and stop URDF Studio/i);
    assert.match(result.sanitizedOutput, /1\.\s+Quit Studio and exit/i);
    assert.match(result.sanitizedOutput, /2\.\s+Keep Studio open/i);
    assert.match(result.sanitizedOutput, /\[Enter\]\s+confirm/i);
    assert.match(result.sanitizedOutput, /\[Esc\]\s+Keep Studio open/i);
    assert.match(result.sanitizedOutput, /stopped URDF Studio/i);
    assert.doesNotMatch(result.sanitizedOutput, /ilu terminal disconnected\. URDF Studio kept/i);

    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && isProcessAlive(managedStudio.pid)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(isProcessAlive(managedStudio.pid), false);
  } finally {
    await new Promise((resolve) => webServer.close(resolve));
    await new Promise((resolve) => apiServer.close(resolve));
    if (isProcessAlive(managedStudio.pid)) {
      try {
        process.kill(-managedStudio.pid, "SIGKILL");
      } catch {
        try {
          process.kill(managedStudio.pid, "SIGKILL");
        } catch {
          // Ignore final cleanup failures in tests.
        }
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ptyTest("TTY shell saves the working URDF before the Studio exit prompt", async () => {
  const tempDir = createTempDir("ilu-pty-save-exit-");
  const runtimeFile = path.join(tempDir, "studio-runtime.json");
  const managedStudio = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
    detached: true,
    stdio: "ignore",
  });
  managedStudio.unref();
  fs.writeFileSync(
    runtimeFile,
    `${JSON.stringify(
      {
        pid: managedStudio.pid,
        studioRoot: tempDir,
        webUrl: "http://127.0.0.1:1/",
        apiHealthUrl: "http://127.0.0.1:2/health",
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const webServer = await startHttpServer();
  const apiServer = await startHttpServer();
  const webAddress = webServer.address();
  const apiAddress = apiServer.address();
  const sourcePath = path.join(tempDir, "broken.urdf");
  fs.writeFileSync(
    sourcePath,
    '<robot name="broken"><link name="base"><visual><geometry><mesh filename="meshes\\\\part.stl"/></geometry></visual></link></robot>',
    "utf8"
  );

  try {
    assert.equal(typeof webAddress === "object" && webAddress ? webAddress.port > 0 : false, true);
    assert.equal(typeof apiAddress === "object" && apiAddress ? apiAddress.port > 0 : false, true);

    const result = await runPtyShellSession({
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
        ILU_STUDIO_RUNTIME_FILE: runtimeFile,
        URDF_STUDIO_URL: `http://127.0.0.1:${webAddress.port}/`,
        URDF_STUDIO_API_URL: `http://127.0.0.1:${apiAddress.port}/health`,
      },
      steps: [
        { delayMs: 150, data: "\r" },
        { delayMs: 150, data: `${sourcePath}\n` },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "1" },
        { delayMs: 1_100, data: "\u0003" },
        { delayMs: 900, data: "\r" },
        { delayMs: 900, data: "\r" },
        { delayMs: 900, data: "\r" },
      ],
      timeoutMs: 18_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /save the working URDF before exit\?/i);
    assert.match(result.sanitizedOutput, /1\.\s+Save changes/i);
    assert.match(result.sanitizedOutput, /2\.\s+Exit without saving/i);
    assert.match(result.sanitizedOutput, /save path\s+Enter uses/i);
    assert.match(result.sanitizedOutput, /saved working URDF to .*broken\.urdf/i);
    assert.match(result.sanitizedOutput, /leave ilu and stop URDF Studio/i);

    const savePromptIndex = result.sanitizedOutput.search(/save the working URDF before exit\?/i);
    const studioPromptIndex = result.sanitizedOutput.search(/leave ilu and stop URDF Studio/i);
    assert.ok(savePromptIndex >= 0);
    assert.ok(studioPromptIndex > savePromptIndex);

    const savedContent = fs.readFileSync(sourcePath, "utf8");
    assert.match(savedContent, /meshes\/part\.stl/);
    assert.doesNotMatch(savedContent, /meshes\\\\part\.stl/);
  } finally {
    await new Promise((resolve) => webServer.close(resolve));
    await new Promise((resolve) => apiServer.close(resolve));
    if (isProcessAlive(managedStudio.pid)) {
      try {
        process.kill(-managedStudio.pid, "SIGKILL");
      } catch {
        try {
          process.kill(managedStudio.pid, "SIGKILL");
        } catch {
          // Ignore final cleanup failures in tests.
        }
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ptyTest("TTY shell applies /align without opening the URDF manually", async () => {
  const yUpUrdfPath = path.resolve("examples", "orientation-card", "research_wheeled_y_up.urdf");
  const result = await runPtyShellSession({
    env: {
      ILU_DISABLE_UPDATE_CHECK: "1",
    },
    steps: [
      { delayMs: 150, data: "\r" },
      { delayMs: 150, data: `${yUpUrdfPath}\n` },
      { delayMs: 1_100, data: "/align" },
      { delayMs: 250, data: "\r" },
      { delayMs: 1_100, data: "\u0003" },
      { delayMs: 900, data: "2" },
    ],
    timeoutMs: 10_000,
  });

  assert.equal(result.code, 0);
  assert.match(result.sanitizedOutput, /aligning orientation/i);
  assert.match(result.sanitizedOutput, /\/align/i);
  assert.match(result.sanitizedOutput, /working urdf .*research_wheeled_y_up\.urdf/i);
  assert.doesNotMatch(result.sanitizedOutput, /updated the working copy|working copy ready/i);
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
        URDF_STUDIO_REPO: missingStudioRepoPath,
      },
      steps: [
        { delayMs: 150, data: "\r" },
        { delayMs: 150, data: `${brokenUrdfPath}\n` },
        { delayMs: 1_100, data: "\u001b" },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "\r" },
        { delayMs: 1_100, data: "\u0003" },
        { delayMs: 900, data: "2" },
      ],
      timeoutMs: 14_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /review the remaining issues now\?/i);
    assert.match(result.sanitizedOutput, /1\.\s+Review now/i);
    assert.match(result.sanitizedOutput, /2\.\s+Later/i);
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
  assert.match(result.sanitizedOutput, /i<3urdf/i);
  assert.doesNotMatch(result.output, /\u001b\[H\u001b\[J\n?$/);
});

ptyTest("TTY shell prints an explicit attach command on exit when a session is open", async () => {
  const tempHome = createTempDir("ilu-pty-exit-attach-home-");
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
      cliArgs: ["attach", sessionId],
      env: {
        ILU_DISABLE_UPDATE_CHECK: "1",
        HOME: tempHome,
      },
      steps: [{ delayMs: 350, data: "\u0003" }],
      timeoutMs: 8_000,
    });

    assert.equal(result.code, 0);
    assert.match(result.sanitizedOutput, /reopen this session with:/i);
    assert.match(result.sanitizedOutput, new RegExp(`ilu attach ${sessionId}`));
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

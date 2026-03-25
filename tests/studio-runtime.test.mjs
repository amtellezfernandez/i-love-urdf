import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { rootDir } from "./helpers/loadDist.mjs";

const runtime = await import(
  pathToFileURL(path.join(rootDir, "dist", "studio", "studioRuntime.js")).href
);

const {
  getDefaultStudioRootCandidates,
  getPreferredStudioInstallRoot,
  getStudioInstallState,
  isManagedStudioRunning,
  isStudioRepoRoot,
  resolveStudioRoot,
  stopManagedStudio,
  stopManagedStudioImmediately,
} = runtime;

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const createStudioRepo = (dirPath, includeLauncher = true) => {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, "package.json"), "{}\n", "utf8");
  if (includeLauncher) {
    fs.mkdirSync(path.join(dirPath, "tools", "scripts"), { recursive: true });
    fs.writeFileSync(path.join(dirPath, "tools", "scripts", "run.js"), "console.log(\'ok\');\n", "utf8");
  }
};

const createStudioSetup = (dirPath) => {
  fs.mkdirSync(path.join(dirPath, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(dirPath, ".venv", "bin"), { recursive: true });
  fs.writeFileSync(path.join(dirPath, ".venv", "bin", "python3"), "", "utf8");
};

test("default Studio repo candidates prefer urdf-studio-unprod first", () => {
  const candidateNames = getDefaultStudioRootCandidates().map((candidate) => path.basename(candidate));
  assert.deepEqual(candidateNames.slice(0, 2), ["urdf-studio-unprod", "urdf-studio"]);
});

test("preferred Studio install root uses the explicit override when provided", () => {
  const explicitDir = path.join(os.tmpdir(), "ilu-studio-explicit-root");
  assert.equal(getPreferredStudioInstallRoot(explicitDir), explicitDir);
});

test("isStudioRepoRoot requires both package.json and the launcher script", () => {
  const tempDir = createTempDir("ilu-studio-root-");
  const placeholderDir = path.join(tempDir, "placeholder");
  const runnableDir = path.join(tempDir, "runnable");

  try {
    createStudioRepo(placeholderDir, false);
    createStudioRepo(runnableDir, true);

    assert.equal(isStudioRepoRoot(placeholderDir), false);
    assert.equal(isStudioRepoRoot(runnableDir), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveStudioRoot skips placeholder candidates and honors a valid explicit override", () => {
  const tempDir = createTempDir("ilu-studio-resolve-");
  const placeholderDir = path.join(tempDir, "placeholder");
  const candidateDir = path.join(tempDir, "candidate");
  const explicitDir = path.join(tempDir, "explicit");

  try {
    createStudioRepo(placeholderDir, false);
    createStudioRepo(candidateDir, true);
    createStudioRepo(explicitDir, true);

    assert.equal(
      resolveStudioRoot({
        candidateRoots: [placeholderDir, candidateDir],
      }),
      candidateDir
    );
    assert.equal(
      resolveStudioRoot({
        explicitEnv: explicitDir,
        candidateRoots: [candidateDir],
      }),
      explicitDir
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("getStudioInstallState distinguishes missing repos from repos that still need setup", () => {
  const tempDir = createTempDir("ilu-studio-state-");
  const candidateDir = path.join(tempDir, "candidate");
  const missingDir = path.join(tempDir, "missing");

  try {
    assert.deepEqual(getStudioInstallState({ explicitEnv: missingDir }), {
      status: "missing-repo",
      studioRoot: null,
      installRoot: missingDir,
      reason:
        "URDF Studio repo not found. Set URDF_STUDIO_REPO or install it next to i-love-urdf as urdf-studio-unprod or urdf-studio.",
    });

    createStudioRepo(candidateDir, true);
    assert.deepEqual(getStudioInstallState({ explicitEnv: candidateDir }), {
      status: "needs-setup",
      studioRoot: candidateDir,
      installRoot: candidateDir,
      reason: 'URDF Studio is present but not set up yet. Run "npm run setup" in the Studio repo first.',
    });

    createStudioSetup(candidateDir);
    assert.deepEqual(getStudioInstallState({ explicitEnv: candidateDir }), {
      status: "ready",
      studioRoot: candidateDir,
      installRoot: candidateDir,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("stopManagedStudio stops the detached ilu-managed runtime and clears its state file", async () => {
  const tempDir = createTempDir("ilu-studio-runtime-");
  const runtimeFile = path.join(tempDir, "studio-runtime.json");
  const managed = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
    detached: true,
    stdio: "ignore",
  });
  managed.unref();

  const previousRuntimeFile = process.env.ILU_STUDIO_RUNTIME_FILE;
  process.env.ILU_STUDIO_RUNTIME_FILE = runtimeFile;
  fs.writeFileSync(
    runtimeFile,
    `${JSON.stringify(
      {
        pid: managed.pid,
        studioRoot: tempDir,
        webUrl: "http://127.0.0.1:65534/",
        apiHealthUrl: "http://127.0.0.1:65535/health",
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  try {
    assert.equal(isManagedStudioRunning(), true);
    const result = await stopManagedStudio();
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(runtimeFile), false);

    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && isProcessAlive(managed.pid)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(isProcessAlive(managed.pid), false);
  } finally {
    if (previousRuntimeFile === undefined) {
      delete process.env.ILU_STUDIO_RUNTIME_FILE;
    } else {
      process.env.ILU_STUDIO_RUNTIME_FILE = previousRuntimeFile;
    }
    if (isProcessAlive(managed.pid)) {
      try {
        process.kill(-managed.pid, "SIGKILL");
      } catch {
        try {
          process.kill(managed.pid, "SIGKILL");
        } catch {
          // Ignore final cleanup failures in tests.
        }
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("stopManagedStudioImmediately adopts a matching launcher process even without a runtime file", async () => {
  const tempDir = createTempDir("ilu-studio-adopt-");
  const runtimeFile = path.join(tempDir, "studio-runtime.json");
  const previousRuntimeFile = process.env.ILU_STUDIO_RUNTIME_FILE;
  const previousStudioRepo = process.env.URDF_STUDIO_REPO;

  createStudioRepo(tempDir, true);
  fs.writeFileSync(
    path.join(tempDir, "tools", "scripts", "run.js"),
    "setInterval(() => {}, 1000);\n",
    "utf8"
  );

  const launcher = spawn(process.execPath, [path.join(tempDir, "tools", "scripts", "run.js")], {
    detached: true,
    stdio: "ignore",
  });
  launcher.unref();

  process.env.ILU_STUDIO_RUNTIME_FILE = runtimeFile;
  process.env.URDF_STUDIO_REPO = tempDir;

  try {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && !isProcessAlive(launcher.pid)) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(isProcessAlive(launcher.pid), true);
    assert.equal(fs.existsSync(runtimeFile), false);
    assert.equal(stopManagedStudioImmediately(), true);

    const stoppedDeadline = Date.now() + 3_000;
    while (Date.now() < stoppedDeadline && isProcessAlive(launcher.pid)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(isProcessAlive(launcher.pid), false);
    assert.equal(fs.existsSync(runtimeFile), false);
  } finally {
    if (previousRuntimeFile === undefined) {
      delete process.env.ILU_STUDIO_RUNTIME_FILE;
    } else {
      process.env.ILU_STUDIO_RUNTIME_FILE = previousRuntimeFile;
    }
    if (previousStudioRepo === undefined) {
      delete process.env.URDF_STUDIO_REPO;
    } else {
      process.env.URDF_STUDIO_REPO = previousStudioRepo;
    }
    if (isProcessAlive(launcher.pid)) {
      try {
        process.kill(-launcher.pid, "SIGKILL");
      } catch {
        try {
          process.kill(launcher.pid, "SIGKILL");
        } catch {
          // Ignore final cleanup failures in tests.
        }
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

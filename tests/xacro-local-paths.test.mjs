import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { rootDir } from "./helpers/loadDist.mjs";

const { expandLocalXacroToUrdf } = await import(
  pathToFileURL(path.join(rootDir, "dist", "xacro", "xacroNode.js")).href
);

const PYTHON_EXECUTABLE_CANDIDATES = process.platform === "win32"
  ? ["py", "python", "python3"]
  : ["python3", "python", "py"];

const resolveTestPythonExecutable = () =>
  PYTHON_EXECUTABLE_CANDIDATES.find((candidate) => {
    try {
      const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
      return result.status === 0;
    } catch {
      return false;
    }
  }) ?? null;

const helperScript = `#!/usr/bin/env python3
import json
import sys

payload = json.load(sys.stdin)
assert payload["target_path"] == "robot.urdf.xacro"
print(json.dumps({
    "ok": True,
    "urdf": "<?xml version=\\"1.0\\"?><robot name=\\"canonical_local_xacro\\"><link name=\\"base_link\\"/></robot>",
    "stderr": None,
    "runtime": "python-xacro"
}))
`;

test("expandLocalXacroToUrdf accepts a target under a symlinked root", async (t) => {
  if (process.platform === "win32") {
    t.skip("directory symlink creation is not reliable on Windows CI");
    return;
  }

  const pythonExecutable = resolveTestPythonExecutable();
  if (!pythonExecutable) {
    t.skip("requires a Python executable on PATH");
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-local-xacro-paths-"));
  const realRoot = path.join(tempRoot, "real-root");
  const symlinkRoot = path.join(tempRoot, "symlink-root");
  const helperPath = path.join(tempRoot, "fake_xacro_helper.py");
  const xacroPath = path.join(realRoot, "robot.urdf.xacro");

  fs.mkdirSync(realRoot, { recursive: true });
  fs.writeFileSync(
    xacroPath,
    [
      "<robot xmlns:xacro=\"http://www.ros.org/wiki/xacro\" name=\"canonical_local_xacro\">",
      "  <link name=\"base_link\"/>",
      "</robot>",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(helperPath, helperScript, { encoding: "utf8", mode: 0o755 });

  try {
    fs.symlinkSync(realRoot, symlinkRoot, "dir");
  } catch {
    t.skip("directory symlink creation is not available");
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return;
  }

  try {
    const result = await expandLocalXacroToUrdf({
      xacroPath,
      rootPath: symlinkRoot,
      pythonExecutable,
      helperScriptPath: helperPath,
    });

    assert.equal(result.xacroPath, "robot.urdf.xacro");
    assert.equal(result.rootPath, fs.realpathSync(realRoot));
    assert.equal(result.inspectedPath, fs.realpathSync(xacroPath));
    assert.match(result.urdf, /canonical_local_xacro/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

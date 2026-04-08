import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { rootDir } from "./helpers/loadDist.mjs";

const { expandFetchedGitHubRepositoryXacro } = await import(
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
import os
from pathlib import Path
import sys

payload = json.load(sys.stdin)
counter_path = Path(os.environ["ILU_TEST_COUNTER_PATH"])
attempt = 0
if counter_path.exists():
    attempt = int(counter_path.read_text(encoding="utf-8").strip() or "0")
attempt += 1
counter_path.write_text(str(attempt), encoding="utf-8")

if attempt == 1:
    print(json.dumps({
        "ok": False,
        "error": "Package 'xarm_description' not found in uploaded files."
    }))
else:
    print(json.dumps({
        "ok": True,
        "urdf": "<?xml version=\\"1.0\\"?><robot name=\\"xarm\\"><link name=\\"base_link\\"><visual><geometry><box size=\\"1 1 1\\"/></geometry></visual></link></robot>",
        "stderr": None,
        "runtime": "vendored-xacrodoc"
    }))
`;

test("expandFetchedGitHubRepositoryXacro retries local packages without remote dependency scans", async (t) => {
  const pythonExecutable = resolveTestPythonExecutable();
  if (!pythonExecutable) {
    t.skip("requires a Python executable on PATH");
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-github-xacro-recovery-"));
  const helperPath = path.join(tempRoot, "fake_xacro_helper.py");
  const counterPath = path.join(tempRoot, "attempts.txt");
  fs.writeFileSync(helperPath, helperScript, { encoding: "utf-8", mode: 0o755 });

  const originalFetch = globalThis.fetch;
  const originalCounterEnv = process.env.ILU_TEST_COUNTER_PATH;

  const fileBodies = new Map([
    [
      "https://example.test/xarm_description/robots/robot.urdf.xacro",
      `<?xml version="1.0"?>
<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="xarm">
  <xacro:include filename="$(find xarm_description)/urdf/common.xacro"/>
  <xacro:common/>
</robot>`,
    ],
    [
      "https://example.test/xarm_description/package.xml",
      "<package><name>xarm_description</name></package>",
    ],
    [
      "https://example.test/xarm_description/urdf/common.xacro",
      `<?xml version="1.0"?>
<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="xarm_description">
  <xacro:macro name="common">
    <link name="base_link"/>
  </xacro:macro>
</robot>`,
    ],
  ]);

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://example.test/")) {
      const body = fileBodies.get(url);
      return body
        ? new Response(body, { status: 200, headers: { "Content-Type": "application/xml" } })
        : new Response("not found", { status: 404 });
    }
    if (url.includes("data.jsdelivr.com") || url.includes("cdn.jsdelivr.net") || url.includes("api.github.com")) {
      throw new Error(`unexpected remote dependency lookup: ${url}`);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  process.env.ILU_TEST_COUNTER_PATH = counterPath;

  try {
    const result = await expandFetchedGitHubRepositoryXacro(
      {
        owner: "xarm-developer",
        repo: "xarm_ros",
        path: "xarm_description/robots/robot.urdf.xacro",
      },
      "main",
      [
        {
          name: "robot.urdf.xacro",
          path: "xarm_description/robots/robot.urdf.xacro",
          type: "file",
          download_url: "https://example.test/xarm_description/robots/robot.urdf.xacro",
        },
        {
          name: "package.xml",
          path: "xarm_description/package.xml",
          type: "file",
          download_url: "https://example.test/xarm_description/package.xml",
        },
        {
          name: "common.xacro",
          path: "xarm_description/urdf/common.xacro",
          type: "file",
          download_url: "https://example.test/xarm_description/urdf/common.xacro",
        },
      ],
      {
        helperScriptPath: helperPath,
        pythonExecutable,
      }
    );

    assert.match(result.urdf, /<link name="base_link"/);
    assert.equal(fs.readFileSync(counterPath, "utf-8"), "2");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCounterEnv === undefined) {
      delete process.env.ILU_TEST_COUNTER_PATH;
    } else {
      process.env.ILU_TEST_COUNTER_PATH = originalCounterEnv;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

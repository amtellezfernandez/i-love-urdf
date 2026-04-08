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

test("line shell uses /run for the default repo action instead of reloading a multi-robot source", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-line-repo-run-"));

  try {
    fs.writeFileSync(path.join(tempDir, "a.urdf"), '<robot name="a"><link name="base"/></robot>');
    fs.writeFileSync(path.join(tempDir, "b.urdf"), '<robot name="b"><link name="base"/></robot>');

    const result = spawnSync(
      process.execPath,
      [cliPath, "shell"],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          ILU_DISABLE_UPDATE_CHECK: "1",
        },
        input: `${tempDir}\n/run\n/exit\n`,
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /choose what to do with this repo/i);
    assert.match(result.stdout, /selected \/work-one/i);
    assert.match(result.stdout, /choose a robot\. arrows move, enter loads/i);
    assert.match(result.stdout, /> a\.urdf\s+urdf/i);
    assert.doesNotMatch(result.stdout, /load this source into local working storage\?/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

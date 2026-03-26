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
  <link name="tool_tip"/>
  <joint name="tool_joint" type="fixed">
    <parent link="tool_base"/>
    <child link="tool_tip"/>
  </joint>
</robot>`;

test("merge-urdf combines primary and attached URDFs into a prefixed assembly", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-merge-"));

  try {
    const basePath = path.join(tempDir, "base.urdf");
    const toolPath = path.join(tempDir, "tool.urdf");
    const outPath = path.join(tempDir, "merged.urdf");
    fs.writeFileSync(basePath, baseUrdf, "utf8");
    fs.writeFileSync(toolPath, toolUrdf, "utf8");

    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "merge-urdf",
        "--urdf",
        basePath,
        "--attach",
        toolPath,
        "--name",
        "demo_assembly",
        "--out",
        outPath,
      ],
      {
        cwd: rootDir,
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.success, true);
    assert.equal(payload.robotName, "demo_assembly");
    assert.equal(payload.outPath, outPath);
    assert.equal(payload.merged.length, 2);

    const mergedUrdf = fs.readFileSync(outPath, "utf8");
    assert.match(mergedUrdf, /<robot name="demo_assembly">/);
    assert.match(mergedUrdf, /<link name="assembly_root"\/?>/);
    assert.match(mergedUrdf, /<link name="base__base_link"\/?>/);
    assert.match(mergedUrdf, /<link name="tool__tool_base"\/?>/);
    assert.match(mergedUrdf, /<joint[^>]*name="tool__tool_joint"/);
    assert.match(mergedUrdf, /<joint[^>]*name="tool__mount"/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

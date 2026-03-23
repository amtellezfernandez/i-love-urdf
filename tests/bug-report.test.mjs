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

test("ilu bug-report writes diagnostics and local attachments", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-bug-report-test-"));
  const urdfPath = path.join(tempDir, "robot.urdf");
  const sourceDir = path.join(tempDir, "source");
  const outDir = path.join(tempDir, "bundle");

  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(urdfPath, '<robot name="bug"><link name="base"/></robot>', "utf8");
  fs.writeFileSync(path.join(sourceDir, "robot.urdf"), "<robot/>", "utf8");

  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "bug-report", "--out", outDir, "--urdf", urdfPath, "--source", sourceDir],
      {
        cwd: rootDir,
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /wrote bug report to /i);

    const reportPath = path.join(outDir, "report.json");
    assert.equal(fs.existsSync(reportPath), true);

    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(report.version, 1);
    assert.equal(report.inputs.urdfPath, urdfPath);
    assert.equal(report.inputs.sourcePath, sourceDir);
    assert.ok(Array.isArray(report.attachments));
    assert.equal(report.attachments.length, 2);

    const copiedUrdf = report.attachments.find((attachment) => attachment.label === "urdf");
    assert.equal(copiedUrdf.kind, "file-copy");
    assert.equal(fs.existsSync(copiedUrdf.path), true);

    const sourceManifest = report.attachments.find((attachment) => attachment.label === "source");
    assert.equal(sourceManifest.kind, "directory-manifest");
    assert.equal(fs.existsSync(sourceManifest.path), true);
    assert.match(fs.readFileSync(sourceManifest.path, "utf8"), /robot\.urdf/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ilu help bug-report shows bug-report usage", () => {
  const result = spawnSync(process.execPath, [cliPath, "help", "bug-report"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Usage$/m);
  assert.match(result.stdout, /^  ilu bug-report$/m);
  assert.match(result.stdout, /^  ilu bug-report --out <dir>$/m);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";

import { rootDir } from "./helpers/loadDist.mjs";

const archiveLib = await import(
  pathToFileURL(path.join(rootDir, "dist", "commands", "archiveExtraction.js")).href
);

test("sanitizeArchiveEntryPath rejects traversal-style archive entries", () => {
  assert.throws(
    () => archiveLib.sanitizeArchiveEntryPath("../escape.txt"),
    /Archive entry escapes the extraction root/i
  );
  assert.throws(
    () => archiveLib.sanitizeArchiveEntryPath("/absolute.txt"),
    /Archive entry uses an absolute path/i
  );
});

test("extractZipArchiveToTempRoot extracts a nested robot bundle into a temp root", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-archive-test-"));
  const zipPath = path.join(tempRoot, "robot.zip");
  const archive = new AdmZip();
  archive.addFile(
    "robot_bundle/urdf/robot.urdf",
    Buffer.from("<robot name=\"archive_fixture\"><link name=\"base\"/></robot>", "utf8")
  );
  archive.writeZip(zipPath);

  const result = archiveLib.extractZipArchiveToTempRoot(zipPath, { tempDir: tempRoot });

  try {
    assert.match(result.archiveRoot, /ilu-archive-/);
    assert.equal(result.workingPath, path.join(result.archiveRoot, "robot_bundle"));
    assert.equal(
      fs.existsSync(path.join(result.workingPath, "urdf", "robot.urdf")),
      true
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(result.archiveRoot, { recursive: true, force: true });
  }
});

test("extractZipArchiveToTempRoot enforces the total archive size budget", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-archive-budget-"));
  const zipPath = path.join(tempRoot, "large.zip");
  const archive = new AdmZip();
  archive.addFile("robot.urdf", Buffer.from("<robot name=\"budget_fixture\"/>", "utf8"));
  archive.writeZip(zipPath);

  assert.throws(
    () =>
      archiveLib.extractZipArchiveToTempRoot(zipPath, {
        tempDir: tempRoot,
        maxTotalBytes: 8,
      }),
    /Archive exceeds the allowed total size budget/i
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

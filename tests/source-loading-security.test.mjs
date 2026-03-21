import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { rootDir } from "./helpers/loadDist.mjs";

const localRepositoryLib = await import(
  pathToFileURL(path.join(rootDir, "dist", "repository", "localRepositoryInspection.js")).href
);
const loadSourceLib = await import(
  pathToFileURL(path.join(rootDir, "dist", "sources", "loadSourceNode.js")).href
);

const minimalUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="security_fixture">
  <link name="base_link"/>
</robot>`;

test("collectLocalRepositoryFiles skips operational directories", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-local-scan-"));
  const repoRoot = path.join(tempRoot, "repo");

  try {
    fs.mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "robot.urdf"), minimalUrdf, "utf8");
    fs.writeFileSync(path.join(repoRoot, ".git", "ignored.urdf"), minimalUrdf, "utf8");
    fs.writeFileSync(path.join(repoRoot, "node_modules", "pkg", "ignored.urdf"), minimalUrdf, "utf8");

    const files = await localRepositoryLib.collectLocalRepositoryFiles(repoRoot);
    const paths = files.map((file) => file.path).sort();

    assert.deepEqual(paths, ["robot.urdf"]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("loadSourceFromPath rejects repository entry paths outside the selected root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-load-source-"));
  const repoRoot = path.join(tempRoot, "repo");
  const outsideUrdfPath = path.join(tempRoot, "outside.urdf");

  try {
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "robot.urdf"), minimalUrdf, "utf8");
    fs.writeFileSync(outsideUrdfPath, minimalUrdf, "utf8");

    await assert.rejects(
      () =>
        loadSourceLib.loadSourceFromPath({
          path: repoRoot,
          entryPath: "../outside.urdf",
        }),
      /Local repository entrypoint must stay inside the selected root path\./
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("loadSourceFromPath rejects repository entry symlinks that resolve outside the selected root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-load-source-symlink-"));
  const repoRoot = path.join(tempRoot, "repo");
  const outsideUrdfPath = path.join(tempRoot, "outside.urdf");

  try {
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(outsideUrdfPath, minimalUrdf, "utf8");
    fs.symlinkSync(outsideUrdfPath, path.join(repoRoot, "linked.urdf"));

    await assert.rejects(
      () =>
        loadSourceLib.loadSourceFromPath({
          path: repoRoot,
          entryPath: "linked.urdf",
        }),
      /Local repository entrypoint must stay inside the selected root path\./
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("repairLocalRepositoryMeshReferences rejects URDF paths that resolve outside the selected root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-local-repair-symlink-"));
  const repoRoot = path.join(tempRoot, "repo");
  const outsideUrdfPath = path.join(tempRoot, "outside.urdf");

  try {
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(outsideUrdfPath, minimalUrdf, "utf8");
    fs.symlinkSync(outsideUrdfPath, path.join(repoRoot, "linked.urdf"));

    await assert.rejects(
      () =>
        localRepositoryLib.repairLocalRepositoryMeshReferences(
          { path: repoRoot },
          { urdfPath: "linked.urdf" }
        ),
      /Target URDF must stay inside the local repository root\./
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

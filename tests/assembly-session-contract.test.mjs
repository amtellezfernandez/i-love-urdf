import test from "node:test";
import assert from "node:assert/strict";

import { browserLib, lib } from "./helpers/loadDist.mjs";

const sampleAssemblySnapshot = {
  schema: "ilu-assembly-session",
  schemaVersion: 1,
  sessionId: "assembly-1",
  createdAt: "2026-03-26T10:00:00Z",
  updatedAt: "2026-03-26T10:00:01Z",
  label: "bench assembly",
  workspaceRoot: "/tmp/assembly/files",
  selectedPaths: ["base/base.urdf", "tool/tool.urdf"],
  namesByPath: {
    "base/base.urdf": "base.urdf",
    "tool/tool.urdf": "tool.urdf",
  },
  sourceByPath: {
    "base/base.urdf": {
      type: "local",
      folder: "base_pkg",
    },
  },
  robots: [
    {
      id: "base",
      name: "base.urdf",
      sourcePrefix: "base",
      selectedPath: "base/base.urdf",
      source: {
        type: "local",
        rootPath: "/robots/base_pkg",
        folderLabel: "base_pkg",
      },
    },
  ],
};

test("assembly session contract coerces snapshots through the public node entry", () => {
  const snapshot = lib.coerceIluAssemblySessionSnapshot(sampleAssemblySnapshot);

  assert.equal(snapshot?.schema, "ilu-assembly-session");
  assert.equal(snapshot?.schemaVersion, 1);
  assert.equal(snapshot?.sessionId, "assembly-1");
  assert.equal(snapshot?.workspaceRoot, "/tmp/assembly/files");
  assert.deepEqual(snapshot?.selectedPaths, ["base/base.urdf", "tool/tool.urdf"]);
  assert.equal(snapshot?.robots[0]?.source.rootPath, "/robots/base_pkg");
});

test("assembly session contract is shared by the browser entry", () => {
  const snapshot = browserLib.coerceIluAssemblySessionSnapshot(sampleAssemblySnapshot);

  assert.equal(snapshot?.label, "bench assembly");
  assert.equal(
    browserLib.buildIluAssemblyStudioUrl("https://studio.example.local/view", "assembly-1"),
    "https://studio.example.local/view?ilu_assembly=assembly-1"
  );
});

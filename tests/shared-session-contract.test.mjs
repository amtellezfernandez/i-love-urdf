import test from "node:test";
import assert from "node:assert/strict";

import { browserLib, lib } from "./helpers/loadDist.mjs";

const sampleLoadedSource = {
  source: "github",
  urdfPath: "/tmp/working.urdf",
  githubRef: "https://github.com/openai/robot.git",
  githubRevision: "main",
  repositoryUrdfPath: "robots/demo/robot.urdf",
};

test("shared session contract coerces snapshot metadata through the public node entry", () => {
  const snapshot = lib.coerceIluSharedSessionSnapshot({
    schema: lib.ILU_SHARED_SESSION_SCHEMA,
    schemaVersion: lib.ILU_SHARED_SESSION_SCHEMA_VERSION,
    sessionId: "session-1",
    createdAt: "2026-03-23T00:00:00Z",
    updatedAt: "2026-03-23T00:00:01Z",
    workingUrdfPath: "/tmp/working.urdf",
    lastUrdfPath: "/tmp/original.urdf",
    loadedSource: sampleLoadedSource,
  });

  assert.equal(snapshot?.schema, "ilu-shared-session");
  assert.equal(snapshot?.schemaVersion, 1);
  assert.equal(snapshot?.sessionId, "session-1");
  assert.equal(snapshot?.createdAt, "2026-03-23T00:00:00Z");
  assert.equal(snapshot?.updatedAt, "2026-03-23T00:00:01Z");
  assert.equal(snapshot?.workingUrdfPath, "/tmp/working.urdf");
  assert.equal(snapshot?.lastUrdfPath, "/tmp/original.urdf");
  assert.equal(snapshot?.loadedSource?.source, "github");
  assert.equal(snapshot?.loadedSource?.urdfPath, "/tmp/working.urdf");
  assert.equal(snapshot?.loadedSource?.githubRef, "https://github.com/openai/robot.git");
  assert.equal(snapshot?.loadedSource?.githubRevision, "main");
  assert.equal(snapshot?.loadedSource?.repositoryUrdfPath, "robots/demo/robot.urdf");
});

test("shared session contract derives GitHub source from either repo shorthand or URL", () => {
  assert.deepEqual(
    lib.getIluSharedSessionGitHubSource({
      source: "github",
      urdfPath: "/tmp/working.urdf",
      githubRef: "openai/robot",
      githubRevision: "develop",
    }),
    {
      owner: "openai",
      repo: "robot",
      ref: "develop",
      repositoryUrl: "https://github.com/openai/robot",
    }
  );

  assert.deepEqual(browserLib.getIluSharedSessionGitHubSource(sampleLoadedSource), {
    owner: "openai",
    repo: "robot",
    ref: "main",
    repositoryUrl: "https://github.com/openai/robot",
  });
});

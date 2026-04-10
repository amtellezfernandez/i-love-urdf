import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lib } from "./helpers/loadDist.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testsDir, "..");
const cliPath = path.join(rootDir, "dist", "cli.js");
const cliShellRecommendations = await import(
  pathToFileURL(path.join(rootDir, "dist", "commands", "cliShellRecommendations.js")).href
);
const githubRepositoryLib = await import(
  pathToFileURL(path.join(rootDir, "dist", "repository", "githubRepositoryInspection.js")).href
);
const loadSourceLib = await import(
  pathToFileURL(path.join(rootDir, "dist", "sources", "loadSourceNode.js")).href
);

const createLocalMeshFixture = (t, options = {}) => {
  const packageName = options.packageName ?? "AMR_400_Test8_description";
  const meshRef = options.meshRef ?? "../meshes/base.stl";
  const robotName = options.robotName ?? "AMR_400_Test8";
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-mesh-paths-"));
  t.after(() => fs.rmSync(rootPath, { recursive: true, force: true }));

  fs.mkdirSync(path.join(rootPath, "urdf"), { recursive: true });
  fs.mkdirSync(path.join(rootPath, "meshes"), { recursive: true });
  fs.writeFileSync(
    path.join(rootPath, "package.xml"),
    `<?xml version="1.0"?><package><name>${packageName}</name></package>`,
    "utf8"
  );

  if (!options.skipMeshFile) {
    fs.writeFileSync(path.join(rootPath, "meshes", "base.stl"), "solid base\nendsolid base\n", "utf8");
  }

  const urdfPath = path.join(rootPath, "urdf", "robot.urdf");
  fs.writeFileSync(
    urdfPath,
    `<robot name="${robotName}">` +
      `<link name="base_link">` +
      `<visual><geometry><mesh filename="${meshRef}"/></geometry></visual>` +
      `</link>` +
      `</robot>`,
    "utf8"
  );

  return { rootPath, urdfPath, packageName, meshRef, robotName };
};

const runCli = (args) =>
  spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
  });

const createMockGitHubRepository = () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const ref = "main";
  const ownerProfileUrl = `https://api.github.com/users/${owner}`;
  const packageName = "AMR_400_Test8_description";
  const urdfPath = "urdf/robot.urdf";
  const urdfContent =
    `<robot name="AMR_400_Test8">` +
    `<link name="base_link">` +
    `<visual><geometry><mesh filename="../meshes/base.stl"/></geometry></visual>` +
    `</link>` +
    `</robot>`;

  const treeEntries = [
    { path: "package.xml", type: "blob", sha: "pkg-sha", size: 64 },
    { path: "urdf", type: "tree" },
    { path: urdfPath, type: "blob", sha: "urdf-sha", size: urdfContent.length },
    { path: "meshes", type: "tree" },
    { path: "meshes/base.stl", type: "blob", sha: "mesh-sha", size: 32 },
  ];

  const repositoryApiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const treeApiUrl = `${repositoryApiUrl}/git/trees/${ref}?recursive=1`;
  const packageUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/package.xml`;
  const urdfUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${urdfPath}`;

  return {
    owner,
    repo,
    ref,
    ownerProfileUrl,
    packageName,
    urdfPath,
    repositoryApiUrl,
    treeApiUrl,
    packageUrl,
    urdfUrl,
    reference: { owner, repo },
    fileReference: { owner, repo, path: urdfPath },
    responses: new Map([
      [
        repositoryApiUrl,
        () =>
          new Response(
            JSON.stringify({
              default_branch: ref,
              description: "Scoped test robot",
              homepage: "https://robots.example/test-repo",
              topics: ["mobile-base"],
              license: { spdx_id: "Apache-2.0" },
              owner: {
                login: owner,
                url: ownerProfileUrl,
              },
            }),
            { status: 200 }
          ),
      ],
      [
        ownerProfileUrl,
        () =>
          new Response(
            JSON.stringify({
              name: "Test Owner Robotics",
              company: "@test-owner",
              blog: "https://robots.example/about",
              twitter_username: "test_owner",
              email: "owner@test.example",
            }),
            { status: 200 }
          ),
      ],
      [
        treeApiUrl,
        () => new Response(JSON.stringify({ tree: treeEntries }), { status: 200 }),
      ],
      [
        packageUrl,
        () =>
          new Response(
            `<?xml version="1.0"?><package><name>${packageName}</name></package>`,
            { status: 200 }
          ),
      ],
      [urdfUrl, () => new Response(urdfContent, { status: 200 })],
    ]),
  };
};

const createMockGitHubXacroRepository = () => {
  const owner = "test-owner";
  const repo = "test-xacro-repo";
  const ref = "main";
  const xacroPath = "robots/demo/robot.urdf.xacro";
  const xacroContent =
    `<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="demo_robot">` +
    `<xacro:arg name="robot_name" default="demo_robot"/>` +
    `</robot>`;

  const treeEntries = [
    { path: "package.xml", type: "blob", sha: "pkg-sha", size: 64 },
    { path: "robots", type: "tree" },
    { path: "robots/demo", type: "tree" },
    { path: xacroPath, type: "blob", sha: "xacro-sha", size: xacroContent.length },
  ];

  const repositoryApiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const treeApiUrl = `${repositoryApiUrl}/git/trees/${ref}?recursive=1`;
  const packageUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/package.xml`;
  const xacroUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${xacroPath}`;

  return {
    owner,
    repo,
    ref,
    xacroPath,
    packageUrl,
    repositoryApiUrl,
    treeApiUrl,
    reference: { owner, repo },
    fileReference: { owner, repo, path: xacroPath },
    responses: new Map([
      [
        repositoryApiUrl,
        () => new Response(JSON.stringify({ default_branch: ref }), { status: 200 }),
      ],
      [
        treeApiUrl,
        () => new Response(JSON.stringify({ tree: treeEntries }), { status: 200 }),
      ],
      [
        packageUrl,
        () =>
          new Response(
            `<?xml version="1.0"?><package><name>demo_description</name></package>`,
            { status: 200 }
          ),
      ],
      [xacroUrl, () => new Response(xacroContent, { status: 200 })],
    ]),
  };
};

const installFetchMock = (t, fixture) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    const responseFactory = fixture.responses.get(url);
    if (!responseFactory) {
      return new Response(`Unhandled fetch: ${url}`, { status: 404 });
    }
    return responseFactory();
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
};

test("fix-mesh-paths uses the on-disk package.xml name for resolvable relative refs", (t) => {
  const fixture = createLocalMeshFixture(t);
  const result = runCli(["fix-mesh-paths", "--urdf", fixture.urdfPath]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.packageName, fixture.packageName);
  assert.equal(payload.corrections.length, 1);
  assert.deepEqual(payload.unresolved, []);
  assert.match(payload.urdfContent, /package:\/\/AMR_400_Test8_description\/meshes\/base\.stl/);
});

test("mesh-refs reports resolvable relative refs separately from broken ones", (t) => {
  const fixture = createLocalMeshFixture(t);
  const result = runCli(["mesh-refs", "--urdf", fixture.urdfPath]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.packageName, fixture.packageName);
  assert.deepEqual(payload.detectedMeshFolders, ["meshes"]);
  assert.equal(payload.summary.resolvable, 1);
  assert.equal(payload.summary.unresolved, 0);
  assert.equal(payload.summary.normalizable, 1);
  assert.equal(payload.refs[0].status, "resolvable");
  assert.equal(payload.refs[0].needsNormalization, true);
  assert.equal(payload.refs[0].normalizedReference, "package://AMR_400_Test8_description/meshes/base.stl");
});

test("repair-mesh-refs normalizes resolvable local repo refs with the package.xml name", (t) => {
  const fixture = createLocalMeshFixture(t);
  const result = runCli(["repair-mesh-refs", "--local", fixture.rootPath, "--urdf", "urdf/robot.urdf"]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.source, "local");
  assert.equal(payload.urdfPath, "urdf/robot.urdf");
  assert.equal(payload.corrections.length, 1);
  assert.deepEqual(payload.unresolved, []);
  assert.match(payload.content, /package:\/\/AMR_400_Test8_description\/meshes\/base\.stl/);
});

test("repo loading and inspection surface normalizable mesh refs for local repos", (t) => {
  const fixture = createLocalMeshFixture(t);

  const inspectResult = runCli(["inspect-repo", "--local", fixture.rootPath]);
  assert.equal(inspectResult.status, 0);
  const inspectPayload = JSON.parse(inspectResult.stdout);
  assert.equal(inspectPayload.candidates[0].unresolvedMeshReferenceCount, 0);
  assert.equal(inspectPayload.candidates[0].normalizableMeshReferenceCount, 1);

  const loadResult = runCli(["load-source", "--path", fixture.rootPath, "--entry", "urdf/robot.urdf"]);
  assert.equal(loadResult.status, 0);
  const loadPayload = JSON.parse(loadResult.stdout);
  assert.equal(loadPayload.meshReferenceCorrectionCount, 1);
  assert.equal(loadPayload.meshReferenceUnresolvedCount, 0);

  const suggestion = cliShellRecommendations.detectSuggestedAction(
    {
      loadedSource: {
        source: "local-repo",
        urdfPath: fixture.urdfPath,
        localPath: fixture.rootPath,
        repositoryUrdfPath: "urdf/robot.urdf",
        meshReferenceCorrectionCount: loadPayload.meshReferenceCorrectionCount,
        meshReferenceUnresolvedCount: loadPayload.meshReferenceUnresolvedCount,
      },
      lastUrdfPath: fixture.urdfPath,
    },
    { urdfPath: fixture.urdfPath }
  );
  assert.equal(suggestion?.kind, "repair-mesh-refs");
});

test("scoped local repo paths keep package and mesh context above the selected subdir", (t) => {
  const fixture = createLocalMeshFixture(t);
  const scopedPath = path.join(fixture.rootPath, "urdf");

  const inspectResult = runCli(["inspect-repo", "--local", scopedPath]);
  assert.equal(inspectResult.status, 0);
  const inspectPayload = JSON.parse(inspectResult.stdout);
  assert.equal(inspectPayload.candidates[0].path, "urdf/robot.urdf");
  assert.equal(inspectPayload.candidates[0].normalizableMeshReferenceCount, 1);

  const repairResult = runCli(["repair-mesh-refs", "--local", scopedPath, "--urdf", "robot.urdf"]);
  assert.equal(repairResult.status, 0);
  const repairPayload = JSON.parse(repairResult.stdout);
  assert.equal(repairPayload.urdfPath, "urdf/robot.urdf");
  assert.match(repairPayload.content, /package:\/\/AMR_400_Test8_description\/meshes\/base\.stl/);

  const loadResult = runCli(["load-source", "--path", scopedPath, "--entry", "robot.urdf"]);
  assert.equal(loadResult.status, 0);
  const loadPayload = JSON.parse(loadResult.stdout);
  assert.equal(loadPayload.entryPath, "urdf/robot.urdf");
  assert.equal(loadPayload.rootPath, fixture.rootPath);
  assert.equal(loadPayload.meshReferenceCorrectionCount, 1);
  assert.equal(loadPayload.meshReferenceUnresolvedCount, 0);
});

test("GitHub repo inspection and repair keep root package context for scoped file references", async (t) => {
  const fixture = createMockGitHubRepository();
  installFetchMock(t, fixture);

  const inspection = await githubRepositoryLib.inspectGitHubRepositoryUrdfs(fixture.fileReference);
  assert.equal(inspection.path, fixture.urdfPath);
  assert.equal(inspection.candidateCount, 1);
  assert.equal(inspection.candidates[0].path, fixture.urdfPath);
  assert.equal(inspection.candidates[0].unresolvedMeshReferenceCount, 0);
  assert.equal(inspection.candidates[0].normalizableMeshReferenceCount, 1);

  const repaired = await githubRepositoryLib.repairGitHubRepositoryMeshReferences(fixture.fileReference);
  assert.equal(repaired.urdfPath, fixture.urdfPath);
  assert.equal(repaired.corrections.length, 1);
  assert.deepEqual(repaired.unresolved, []);
  assert.match(repaired.content, /package:\/\/AMR_400_Test8_description\/meshes\/base\.stl/);
});

test("GitHub Xacro inspection skips package.xml fetches when no plain URDF candidates are inspected", async (t) => {
  const fixture = createMockGitHubXacroRepository();
  const requestedUrls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    requestedUrls.push(url);
    const responseFactory = fixture.responses.get(url);
    if (!responseFactory) {
      return new Response(`Unhandled fetch: ${url}`, { status: 404 });
    }
    return responseFactory();
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const inspection = await githubRepositoryLib.inspectGitHubRepositoryUrdfs(fixture.fileReference);

  assert.equal(inspection.candidateCount, 1);
  assert.equal(inspection.candidates[0].inspectionMode, "xacro-source");
  assert.equal(requestedUrls.includes(fixture.packageUrl), false);
});

test("GitHub repository metadata preserves owner enrichment for legacy token callers", async (t) => {
  const fixture = createMockGitHubRepository();
  const requestedUrls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    requestedUrls.push(url);
    const responseFactory = fixture.responses.get(url);
    if (!responseFactory) {
      return new Response(`Unhandled fetch: ${url}`, { status: 404 });
    }
    return responseFactory();
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const metadata = await githubRepositoryLib.fetchGitHubRepositoryMetadata(
    fixture.reference,
    "ghs_test_token"
  );

  assert.equal(metadata.org, "Test Owner Robotics");
  assert.equal(metadata.authorWebsite, "https://robots.example/about");
  assert.equal(metadata.authorX, "@test_owner");
  assert.equal(metadata.contact, "owner@test.example");
  assert.equal(metadata.authorGithub, fixture.owner);
  assert.equal(requestedUrls.includes(fixture.ownerProfileUrl), true);
});

test("loadSourceFromGitHub keeps mesh repair visibility for scoped file references", async (t) => {
  const fixture = createMockGitHubRepository();
  installFetchMock(t, fixture);

  const loaded = await loadSourceLib.loadSourceFromGitHub({
    reference: fixture.fileReference,
  });

  assert.equal(loaded.entryPath, fixture.urdfPath);
  assert.equal(loaded.primaryCandidatePath, fixture.urdfPath);
  assert.equal(loaded.meshReferenceCorrectionCount, 1);
  assert.equal(loaded.meshReferenceUnresolvedCount, 0);
});

test("scoped GitHub directory references resolve relative entry paths with full repo context", async (t) => {
  const fixture = createMockGitHubRepository();
  installFetchMock(t, fixture);
  const directoryReference = {
    owner: fixture.owner,
    repo: fixture.repo,
    path: "urdf",
  };

  const repaired = await githubRepositoryLib.repairGitHubRepositoryMeshReferences(directoryReference, {
    urdfPath: "robot.urdf",
  });
  assert.equal(repaired.urdfPath, fixture.urdfPath);
  assert.match(repaired.content, /package:\/\/AMR_400_Test8_description\/meshes\/base\.stl/);

  const loaded = await loadSourceLib.loadSourceFromGitHub({
    reference: directoryReference,
    entryPath: "robot.urdf",
  });
  assert.equal(loaded.entryPath, fixture.urdfPath);
  assert.equal(loaded.meshReferenceCorrectionCount, 1);
  assert.equal(loaded.meshReferenceUnresolvedCount, 0);
});

test("shell suggestions ignore merely normalizable local mesh refs but still flag broken ones", (t) => {
  const resolvableFixture = createLocalMeshFixture(t);
  const unresolvedFixture = createLocalMeshFixture(t, {
    meshRef: "../meshes/missing.stl",
    skipMeshFile: true,
  });

  const noMeshFixSuggestion = cliShellRecommendations.detectSuggestedAction(
    {
      loadedSource: {
        source: "local-file",
        urdfPath: resolvableFixture.urdfPath,
      },
      lastUrdfPath: resolvableFixture.urdfPath,
    },
    { urdfPath: resolvableFixture.urdfPath }
  );
  assert.equal(noMeshFixSuggestion, null);

  const meshFixSuggestion = cliShellRecommendations.detectSuggestedAction(
    {
      loadedSource: {
        source: "local-file",
        urdfPath: unresolvedFixture.urdfPath,
      },
      lastUrdfPath: unresolvedFixture.urdfPath,
    },
    { urdfPath: unresolvedFixture.urdfPath }
  );
  assert.equal(meshFixSuggestion?.kind, "fix-mesh-paths");

  const fixResult = runCli(["fix-mesh-paths", "--urdf", unresolvedFixture.urdfPath]);
  const payload = JSON.parse(fixResult.stdout);
  assert.equal(fixResult.status, 0);
  assert.equal(payload.corrections.length, 0);
  assert.deepEqual(payload.unresolved, ["../meshes/missing.stl"]);
  assert.match(payload.urdfContent, /\.\.\/meshes\/missing\.stl/);
});

test("fixMeshPaths keeps robot-name package hints case-sensitive when package.xml is unavailable", () => {
  const result = lib.fixMeshPaths(
    '<robot name="AMR_400_Test8"><link name="base"><visual><geometry><mesh filename="../meshes/base.stl"/></geometry></visual></link></robot>'
  );

  assert.equal(result.packageName, "AMR_400_Test8_description");
  assert.match(result.urdfContent, /package:\/\/AMR_400_Test8_description\/meshes\/base\.stl/);
});

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const {
  buildRenderTargetCandidates,
  createThumbnailRenderReadyPredicate,
  isMissingThumbnailTargetError,
  isRetryableThumbnailTargetError,
  isThumbnailRenderReady,
  resolveRenderableTargetPath,
  selectResolvedRenderTargetPath,
} = await import(
  path.join("/home/am/dev/i-love-urdf", "dist", "gallery", "repoMediaRender.js")
);

test("thumbnail render readiness prefers the structured gallery render state", () => {
  assert.equal(
    isThumbnailRenderReady({
      renderState: {
        phase: "ready",
        ready: true,
        cameraApplied: true,
        error: null,
      },
      thumbError: "",
      readyAttribute: "0",
    }),
    true
  );

  assert.equal(
    isThumbnailRenderReady({
      renderState: {
        phase: "framing",
        ready: false,
        cameraApplied: true,
        error: null,
      },
      thumbError: "",
      readyAttribute: "1",
    }),
    false
  );
});

test("thumbnail render readiness surfaces structured render errors and falls back to the legacy attribute", () => {
  assert.throws(
    () =>
      isThumbnailRenderReady({
        renderState: {
          phase: "error",
          ready: false,
          cameraApplied: false,
          error: "render failed",
        },
        thumbError: "",
        readyAttribute: "0",
      }),
    /render failed/
  );

  assert.equal(
    isThumbnailRenderReady({
      renderState: null,
      thumbError: "",
      readyAttribute: "1",
    }),
    true
  );
});

test("thumbnail wait predicate is self-contained for Playwright browser evaluation", () => {
  const predicate = createThumbnailRenderReadyPredicate();
  const predicateSource = Function.prototype.toString.call(predicate);
  assert.doesNotMatch(predicateSource, /exports|isThumbnailRenderReady/);

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  try {
    globalThis.window = {
      __URDF_GALLERY_RENDER_STATE__: {
        phase: "ready",
        ready: true,
        cameraApplied: true,
        error: null,
      },
      __URDF_THUMB_ERROR__: "",
    };
    globalThis.document = {
      body: {
        getAttribute: () => "0",
      },
    };
    assert.equal(predicate(), true);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test("buildRenderTargetCandidates adds scoped GitHub path fallbacks for relative candidates", () => {
  assert.deepEqual(
    buildRenderTargetCandidates(
      {
        kind: "github",
        githubUrl: "https://github.com/acme/robots/tree/main/robots/demo",
        sourcePath: "robots/demo",
        ref: "main",
      },
      "demo.urdf"
    ),
    ["demo.urdf", "robots/demo/demo.urdf"]
  );
});

test("resolveRenderableTargetPath retries scoped fallbacks after a missing-target error", async () => {
  const attemptedTargets = [];
  const resolved = await resolveRenderableTargetPath(
    {
      kind: "github",
      githubUrl: "https://github.com/acme/robots/tree/main/robots/demo",
      sourcePath: "robots/demo",
      ref: "main",
    },
    "demo.urdf",
    async (targetPath) => {
      attemptedTargets.push(targetPath);
      if (targetPath === "demo.urdf") {
        throw new Error("Unable to find the requested URDF target in the GitHub repository.");
      }
    }
  );

  assert.equal(resolved, "robots/demo/demo.urdf");
  assert.deepEqual(attemptedTargets, ["demo.urdf", "robots/demo/demo.urdf"]);
});

test("resolveRenderableTargetPath retries scoped fallbacks after an empty-geometry target error", async () => {
  const attemptedTargets = [];
  const resolved = await resolveRenderableTargetPath(
    {
      kind: "github",
      githubUrl: "https://github.com/acme/robots/tree/main/robots/demo",
      sourcePath: "robots/demo",
      ref: "main",
    },
    "demo.urdf",
    async (targetPath) => {
      attemptedTargets.push(targetPath);
      if (targetPath === "demo.urdf") {
        throw new Error(
          "Selected URDF/Xacro expands to no renderable geometry. Pick a top-level robot model file."
        );
      }
    }
  );

  assert.equal(resolved, "robots/demo/demo.urdf");
  assert.deepEqual(attemptedTargets, ["demo.urdf", "robots/demo/demo.urdf"]);
});

test("resolveRenderableTargetPath does not swallow unrelated errors", async () => {
  await assert.rejects(
    resolveRenderableTargetPath(
      {
        kind: "github",
        githubUrl: "https://github.com/acme/robots",
      },
      "demo.urdf",
      async () => {
        throw new Error("network failed");
      }
    ),
    /network failed/
  );
  assert.equal(isMissingThumbnailTargetError(new Error("network failed")), false);
  assert.equal(isRetryableThumbnailTargetError(new Error("network failed")), false);
  assert.equal(
    isRetryableThumbnailTargetError(
      new Error("Selected URDF/Xacro expands to no renderable geometry. Pick a top-level robot model file.")
    ),
    true
  );
});

test("selectResolvedRenderTargetPath picks the real inspected candidate for scoped GitHub renders", () => {
  assert.equal(
    selectResolvedRenderTargetPath(
      {
        kind: "github",
        githubUrl: "https://github.com/acme/robots/tree/main/robots/demo",
        sourcePath: "robots/demo",
        ref: "main",
      },
      "demo.urdf",
      ["robots/demo/demo.urdf", "robots/other/demo.urdf", "robots/demo/helper.xacro"]
    ),
    "robots/demo/demo.urdf"
  );
});

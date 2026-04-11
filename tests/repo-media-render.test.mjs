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

const REAL_GITHUB_SOURCE = {
  kind: "github",
  githubUrl: "https://github.com/google-deepmind/mujoco_menagerie/tree/main/google_barkour_v0",
  sourcePath: "google_barkour_v0",
  ref: "main",
};
const REAL_BARKOUR_TARGET = "barkour_v0.urdf";
const REAL_BARKOUR_REPO_PATH = "google_barkour_v0/barkour_v0.urdf";
const REAL_BARKOUR_VB_REPO_PATH = "google_barkour_vb/barkour_vb_rev_1_0_head_straight.urdf";

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

test("buildRenderTargetCandidates adds scoped GitHub path fallbacks for a real public repo target", () => {
  assert.deepEqual(
    buildRenderTargetCandidates(
      REAL_GITHUB_SOURCE,
      REAL_BARKOUR_TARGET
    ),
    [REAL_BARKOUR_TARGET, REAL_BARKOUR_REPO_PATH]
  );
});

test("resolveRenderableTargetPath retries scoped fallbacks after a missing-target error for a real public repo target", async () => {
  const attemptedTargets = [];
  const resolved = await resolveRenderableTargetPath(
    REAL_GITHUB_SOURCE,
    REAL_BARKOUR_TARGET,
    async (targetPath) => {
      attemptedTargets.push(targetPath);
      if (targetPath === REAL_BARKOUR_TARGET) {
        throw new Error("Unable to find the requested URDF target in the GitHub repository.");
      }
    }
  );

  assert.equal(resolved, REAL_BARKOUR_REPO_PATH);
  assert.deepEqual(attemptedTargets, [REAL_BARKOUR_TARGET, REAL_BARKOUR_REPO_PATH]);
});

test("resolveRenderableTargetPath retries scoped fallbacks after an empty-geometry target error for a real public repo target", async () => {
  const attemptedTargets = [];
  const resolved = await resolveRenderableTargetPath(
    REAL_GITHUB_SOURCE,
    REAL_BARKOUR_TARGET,
    async (targetPath) => {
      attemptedTargets.push(targetPath);
      if (targetPath === REAL_BARKOUR_TARGET) {
        throw new Error(
          "Selected URDF/Xacro expands to no renderable geometry. Pick a top-level robot model file."
        );
      }
    }
  );

  assert.equal(resolved, REAL_BARKOUR_REPO_PATH);
  assert.deepEqual(attemptedTargets, [REAL_BARKOUR_TARGET, REAL_BARKOUR_REPO_PATH]);
});

test("resolveRenderableTargetPath does not swallow unrelated errors", async () => {
  await assert.rejects(
    resolveRenderableTargetPath(
      REAL_GITHUB_SOURCE,
      REAL_BARKOUR_TARGET,
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
      REAL_GITHUB_SOURCE,
      REAL_BARKOUR_TARGET,
      [
        REAL_BARKOUR_REPO_PATH,
        REAL_BARKOUR_VB_REPO_PATH,
      ]
    ),
    REAL_BARKOUR_REPO_PATH
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const { isThumbnailRenderReady } = await import(
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

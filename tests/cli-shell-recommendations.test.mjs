import test from "node:test";
import assert from "node:assert/strict";

import { detectSuggestedAction } from "../dist/commands/cliShellRecommendations.js";

test("detectSuggestedAction skips align-orientation when the orientation guess has conflicts", () => {
  const suggestion = detectSuggestedAction(
    {
      loadedSource: null,
      lastUrdfPath: "/tmp/robot.urdf",
    },
    {
      orientationGuess: {
        isValid: true,
        confidence: 0.89,
        report: {
          conflicts: ["PCA up cue suggests +z, while the final basis kept +x as up."],
        },
        suggestedApplyOrientation: {
          sourceUpAxis: "+x",
          sourceForwardAxis: "+y",
          targetUpAxis: "+z",
          targetForwardAxis: "+x",
        },
      },
    }
  );

  assert.equal(suggestion, null);
});

test("detectSuggestedAction still offers align-orientation for high-confidence conflict-free guesses", () => {
  const suggestion = detectSuggestedAction(
    {
      loadedSource: null,
      lastUrdfPath: "/tmp/robot.urdf",
    },
    {
      orientationGuess: {
        isValid: true,
        confidence: 0.89,
        report: {
          conflicts: [],
        },
        suggestedApplyOrientation: {
          sourceUpAxis: "+x",
          sourceForwardAxis: "+y",
          targetUpAxis: "+z",
          targetForwardAxis: "+x",
        },
      },
    }
  );

  assert.equal(suggestion?.kind, "align-orientation");
  assert.deepEqual(suggestion?.orientationPlan, {
    sourceUpAxis: "+x",
    sourceForwardAxis: "+y",
    targetUpAxis: "+z",
    targetForwardAxis: "+x",
  });
});

import test from "node:test";
import assert from "node:assert/strict";

import { browserLib, lib } from "./helpers/loadDist.mjs";
import {
  badInertiaUrdf,
  mobileManipulatorUrdf,
  wheeledRobotYUp,
  wheeledRobotZUp,
} from "./helpers/fixtures.mjs";

test("morphology cards carry a stable contract and expected tags", () => {
  const card = lib.buildRobotMorphologyCard(lib.analyzeUrdf(mobileManipulatorUrdf), {
    nameHints: ["dual_arm_mobile"],
  });

  assert.equal(card.schema, "i-love-urdf/robot-morphology-card");
  assert.equal(card.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
  assert.equal(card.summary.primaryFamily, "mobile-manipulator");
  assert.ok(card.canonicalTags.includes("mobile-manipulator"));
  assert.ok(card.canonicalTags.includes("wheeled"));
  assert.ok(card.displayTags.includes("Mobile Manipulator"));
  assert.ok(card.tags.some((tag) => tag.tag === "mobile-manipulator" && tag.confidence === "high"));

  const browserCard = browserLib.buildRobotMorphologyCard(
    browserLib.analyzeUrdf(mobileManipulatorUrdf),
    { nameHints: ["dual_arm_mobile"] }
  );
  assert.equal(browserCard.schema, "i-love-urdf/robot-morphology-card");
  assert.equal(browserCard.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
  assert.equal(browserLib.getRobotMorphologyDisplayTags(browserCard)[0], "Mobile Manipulator");
});

test("health checks carry a stable contract and nest orientation reports consistently", () => {
  const report = lib.healthCheckUrdf(badInertiaUrdf);

  assert.equal(report.schema, "i-love-urdf/health-check-report");
  assert.equal(report.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "triangle-inequality"));
  assert.ok(report.findings.some((finding) => finding.code === "orientation-guess"));
  assert.equal(report.orientationGuess?.schema, "i-love-urdf/orientation-guess");
  assert.equal(report.orientationGuess?.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
});

test("orientation guesses and cards carry a stable contract with deterministic classifications", () => {
  const zUpGuess = lib.guessUrdfOrientation(wheeledRobotZUp);
  assert.equal(zUpGuess.schema, "i-love-urdf/orientation-guess");
  assert.equal(zUpGuess.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
  assert.equal(zUpGuess.likelyUpAxis, "z");
  assert.equal(zUpGuess.likelyForwardAxis, "x");
  assert.ok(zUpGuess.report.evidence.length >= 3);

  const yUpGuess = lib.guessUrdfOrientation(wheeledRobotYUp);
  assert.equal(yUpGuess.schema, "i-love-urdf/orientation-guess");
  assert.equal(yUpGuess.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
  assert.equal(yUpGuess.likelyUpAxis, "y");
  assert.equal(yUpGuess.likelyForwardAxis, "x");

  const zUpCard = lib.buildRobotOrientationCard(wheeledRobotZUp);
  assert.equal(zUpCard.schema, "i-love-urdf/robot-orientation-card");
  assert.equal(zUpCard.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
  assert.equal(zUpCard.summary.classification, "z-up");
  assert.equal(zUpCard.summary.likelyUpDirection, "+z");
  assert.equal(zUpCard.summary.likelyForwardDirection, "+x");
  assert.ok(zUpCard.suggestedApplyOrientation?.command.includes("--source-up +z"));

  const browserCard = browserLib.buildRobotOrientationCard(wheeledRobotYUp);
  assert.equal(browserCard.schema, "i-love-urdf/robot-orientation-card");
  assert.equal(browserCard.schemaVersion, lib.OUTPUT_SCHEMA_VERSION);
  assert.equal(browserCard.summary.classification, "y-up");
  assert.equal(browserCard.summary.likelyUpAxis, "y");
  assert.equal(browserCard.summary.likelyForwardAxis, "x");
});

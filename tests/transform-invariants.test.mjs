import test from "node:test";
import assert from "node:assert/strict";

import { lib } from "./helpers/loadDist.mjs";
import {
  canonicalOrderingUrdf,
  rotationInvariantUrdf,
  snapCandidateUrdf,
  wheeledRobotYUp,
} from "./helpers/fixtures.mjs";

const readJointAxis = (urdfContent) => {
  const parsed = lib.parseURDF(urdfContent);
  assert.equal(parsed.isValid, true);
  const axis = parsed.document.querySelector("joint axis")?.getAttribute("xyz");
  assert.ok(axis);
  return axis.split(/\s+/).map(Number);
};

const readJointOrigin = (urdfContent) => {
  const parsed = lib.parseURDF(urdfContent);
  assert.equal(parsed.isValid, true);
  const origin = parsed.document.querySelector("joint origin")?.getAttribute("xyz");
  assert.ok(origin);
  return origin.split(/\s+/).map(Number);
};

const assertCloseVector = (actual, expected, epsilon = 1e-6) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= epsilon,
      `expected ${expected[index]} at index ${index}, received ${value}`
    );
  });
};

test("canonical ordering is idempotent", () => {
  const first = lib.canonicalOrderURDF(canonicalOrderingUrdf);
  const second = lib.canonicalOrderURDF(first);
  assert.equal(lib.compareUrdfs(first, second).areEqual, true);
});

test("axis snapping is idempotent once a joint has been canonicalized", () => {
  const first = lib.snapJointAxes(snapCandidateUrdf);
  const second = lib.snapJointAxes(first.urdfContent);

  assert.ok(first.urdfContent.includes('axis xyz="0 1 0"'));
  assert.equal(lib.compareUrdfs(first.urdfContent, second.urdfContent).areEqual, true);
  assert.equal(second.snapped.length, 0);
});

test("four quarter turns recover the original joint axis and origin numerically", () => {
  let rotated = rotationInvariantUrdf;
  for (let index = 0; index < 4; index += 1) {
    rotated = lib.rotateRobot90Degrees(rotated, "z");
  }

  assertCloseVector(readJointAxis(rotated), [1, 0, 0]);
  assertCloseVector(readJointOrigin(rotated), [1, 2, 3]);
});

test("orientation application and normalize-robot agree on the repaired up-axis", () => {
  const oriented = lib.applyOrientationToRobot(wheeledRobotYUp, {
    sourceUpAxis: "y",
    sourceForwardAxis: "x",
    targetUpAxis: "z",
    targetForwardAxis: "x",
  });
  const reGuessed = lib.guessUrdfOrientation(oriented);
  assert.equal(reGuessed.likelyUpAxis, "z");

  const dryRun = lib.normalizeRobot(wheeledRobotYUp, {
    snapAxes: true,
    canonicalizeJointFrame: true,
  });
  assert.equal(dryRun.apply, false);
  assert.ok(
    dryRun.plannedSteps.some(
      (step) => step.name === "canonicalize-joint-frame" && step.enabled
    )
  );

  const applied = lib.normalizeRobot(wheeledRobotYUp, {
    apply: true,
    snapAxes: true,
    canonicalizeJointFrame: true,
    sourceUpAxis: "y",
    sourceForwardAxis: "x",
    targetUpAxis: "+z",
    targetForwardAxis: "+x",
  });
  assert.equal(applied.apply, true);
  assert.ok(applied.outputUrdf);
  assert.ok(applied.healthAfter);
});

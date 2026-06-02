import test from "node:test";
import assert from "node:assert/strict";

import { lib } from "./helpers/loadDist.mjs";

const buildPrismaticLimits = (lower, upper) => ({
  finger_joint1: {
    type: "prismatic",
    lower,
    upper,
  },
});

test("resolveJointValueConversionPlan converts servo ticks to radians", () => {
  const plan = lib.resolveJointValueConversionPlan({
    rawRange: {
      min: lib.JOINT_VALUE_CONVERSION_PARAMS.servoTickNeutral,
      max:
        lib.JOINT_VALUE_CONVERSION_PARAMS.servoTickNeutral +
        lib.JOINT_VALUE_CONVERSION_PARAMS.servoTickFullScale / 2,
    },
    targetJointName: "shoulder",
    angularConversionEnabled: true,
  });

  assert.equal(plan.mode, "servo_ticks_to_radians");
  assert.equal(
    lib.convertJointValueWithPlan(
      lib.JOINT_VALUE_CONVERSION_PARAMS.servoTickNeutral,
      plan
    ),
    0
  );
  assert.equal(
    lib.convertJointValueWithPlan(
      lib.JOINT_VALUE_CONVERSION_PARAMS.servoTickNeutral +
        lib.JOINT_VALUE_CONVERSION_PARAMS.servoTickFullScale / 2,
      plan
    ),
    Math.PI / 2
  );
});

test("resolveJointValueConversionPlan normalizes oversized prismatic ranges", () => {
  const gripperClosedMeters =
    lib.JOINT_VALUE_CONVERSION_PARAMS.normalizedOutputLower;
  const gripperOpenMeters = 0.044;
  const plan = lib.resolveJointValueConversionPlan({
    rawRange: {
      min: lib.JOINT_VALUE_CONVERSION_PARAMS.normalizedInputLower,
      max: lib.JOINT_VALUE_CONVERSION_PARAMS.normalizedInputUpper,
    },
    targetJointName: "finger_joint1",
    jointLimits: buildPrismaticLimits(gripperClosedMeters, gripperOpenMeters),
    angularConversionEnabled: true,
  });

  assert.equal(plan.mode, "linear_to_prismatic");
  assert.equal(
    lib.convertJointValueWithPlan(
      lib.JOINT_VALUE_CONVERSION_PARAMS.normalizedInputLower,
      plan
    ),
    gripperClosedMeters
  );
  assert.equal(
    lib.convertJointValueWithPlan(
      lib.JOINT_VALUE_CONVERSION_PARAMS.normalizedInputUpper,
      plan
    ),
    gripperOpenMeters
  );
});

test("resolveJointValueConversionPlan keeps prismatic values already in target units", () => {
  const gripperClosedMeters =
    lib.JOINT_VALUE_CONVERSION_PARAMS.normalizedOutputLower;
  const gripperOpenMeters = 0.044;
  const gripperMidpointMeters = gripperOpenMeters / 2;
  const plan = lib.resolveJointValueConversionPlan({
    rawRange: {
      min: gripperMidpointMeters,
      max: gripperMidpointMeters,
    },
    targetJointName: "finger_joint1",
    jointLimits: buildPrismaticLimits(gripperClosedMeters, gripperOpenMeters),
    angularConversionEnabled: true,
  });

  assert.equal(plan.mode, "identity");
  assert.equal(
    lib.convertJointValueWithPlan(gripperMidpointMeters, plan),
    gripperMidpointMeters
  );
});

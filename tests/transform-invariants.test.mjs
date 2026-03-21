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

const hierarchyFixtureUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="two_link_arm">
  <link name="base_link"/>
  <link name="shoulder_link"/>
  <link name="tool_link"/>
  <joint name="shoulder_joint" type="revolute">
    <parent link="base_link"/>
    <child link="shoulder_link"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.57" upper="1.57" velocity="1.0"/>
  </joint>
  <joint name="tool_joint" type="revolute">
    <parent link="shoulder_link"/>
    <child link="tool_link"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.0" upper="1.0" velocity="1.0"/>
  </joint>
  <transmission name="ignored_transmission">
    <joint name="shoulder_joint"/>
  </transmission>
</robot>`;

const extensionNoiseUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="extension_noise">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 0.2"/>
      </geometry>
    </visual>
  </link>
  <link name="wheel_link">
    <visual>
      <geometry>
        <cylinder radius="0.2" length="0.1"/>
      </geometry>
    </visual>
  </link>
  <joint name="wheel_joint" type="continuous">
    <parent link="base_link"/>
    <child link="wheel_link"/>
    <axis xyz="0 1 0"/>
  </joint>
  <gazebo>
    <link name="plugin_wheel_link">
      <visual>
        <geometry>
          <mesh filename="ignored_plugin_wheel.stl"/>
        </geometry>
      </visual>
    </link>
    <joint name="plugin_wheel_joint" type="continuous">
      <parent link="base_link"/>
      <child link="plugin_wheel_link"/>
      <axis xyz="1 0 0"/>
    </joint>
  </gazebo>
</robot>`;

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

test("joint hierarchy and joint parsers only consider top-level URDF joints", () => {
  const hierarchy = lib.parseJointHierarchy(hierarchyFixtureUrdf);
  assert.deepEqual(
    hierarchy.rootJoints.map((joint) => joint.jointName),
    ["shoulder_joint"]
  );
  assert.deepEqual(
    hierarchy.rootJoints[0]?.children.map((joint) => joint.jointName),
    ["tool_joint"]
  );
  assert.deepEqual(
    hierarchy.orderedJoints.map((joint) => joint.jointName),
    ["shoulder_joint", "tool_joint"]
  );

  assert.deepEqual(lib.parseLinkNames(hierarchyFixtureUrdf), [
    "base_link",
    "shoulder_link",
    "tool_link",
  ]);
  assert.deepEqual(Object.keys(lib.parseJointAxesFromURDF(hierarchyFixtureUrdf)).sort(), [
    "shoulder_joint",
    "tool_joint",
  ]);
  assert.deepEqual(Object.keys(lib.parseJointLimitsFromURDF(hierarchyFixtureUrdf)).sort(), [
    "shoulder_joint",
    "tool_joint",
  ]);
});

test("analysis, orientation, and USD conversion ignore extension-only link and joint tags", () => {
  const analysis = lib.analyzeUrdf(extensionNoiseUrdf);
  assert.equal(analysis.isValid, true);
  assert.deepEqual(analysis.linkNames, ["base_link", "wheel_link"]);
  assert.deepEqual(analysis.rootLinks, ["base_link"]);
  assert.deepEqual(analysis.childLinks, ["wheel_link"]);
  assert.deepEqual(analysis.meshReferences, []);
  assert.deepEqual(analysis.jointHierarchy.orderedJoints.map((joint) => joint.jointName), [
    "wheel_joint",
  ]);

  const orientation = lib.guessUrdfOrientation(extensionNoiseUrdf);
  assert.deepEqual(orientation.wheelJointNames, ["wheel_joint"]);

  const usd = lib.convertURDFToUSD(extensionNoiseUrdf);
  assert.equal(usd.stats.linksConverted, 2);
  assert.equal(usd.stats.jointsConverted, 1);
  assert.equal(usd.usdContent.includes("plugin_wheel_link"), false);
  assert.equal(usd.usdContent.includes("plugin_wheel_joint"), false);

  const mjcf = lib.convertURDFToMJCF(extensionNoiseUrdf);
  assert.equal(mjcf.stats.bodiesCreated, 2);
  assert.equal(mjcf.stats.jointsConverted, 1);
  assert.equal(mjcf.mjcfContent.includes("plugin_wheel_link"), false);
  assert.equal(mjcf.mjcfContent.includes("plugin_wheel_joint"), false);
});

import test from "node:test";
import assert from "node:assert/strict";

import { lib } from "./helpers/loadDist.mjs";

const hostUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="host">
  <link name="base_link"/>
  <link name="mount_plate"/>
  <link name="old_root"/>
  <link name="old_tip"/>
  <link name="keep_me"/>
  <joint name="plate_mount" type="fixed">
    <origin xyz="1 2 3" rpy="0.1 0.2 0.3"/>
    <parent link="base_link"/>
    <child link="mount_plate"/>
  </joint>
  <joint name="old_mount" type="fixed">
    <origin xyz="0.4 0.5 0.6" rpy="0 0 0"/>
    <parent link="mount_plate"/>
    <child link="old_root"/>
  </joint>
  <joint name="old_joint" type="continuous">
    <parent link="old_root"/>
    <child link="old_tip"/>
  </joint>
  <joint name="keep_joint" type="fixed">
    <parent link="base_link"/>
    <child link="keep_me"/>
  </joint>
</robot>`;

const replacementUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="replacement">
  <material name="gray">
    <color rgba="0.5 0.5 0.5 1"/>
  </material>
  <link name="world"/>
  <link name="base">
    <visual>
      <geometry>
        <box size="1 1 1"/>
      </geometry>
      <material name="gray"/>
    </visual>
  </link>
  <link name="tool"/>
  <joint name="joint_world" type="fixed">
    <parent link="world"/>
    <child link="base"/>
  </joint>
  <joint name="tool_joint" type="continuous">
    <parent link="base"/>
    <child link="tool"/>
  </joint>
</robot>`;

test("replaceSubrobotInUrdf swaps a rooted subtree and preserves the host mount", () => {
  const result = lib.replaceSubrobotInUrdf(hostUrdf, {
    targetRootLink: "old_root",
    replacementUrdfContent: replacementUrdf,
    replacementRootLink: "base",
    prefix: "kr1240_new",
  });

  assert.equal(result.success, true);
  assert.equal(result.mountParentLink, "mount_plate");
  assert.equal(result.mountJointName, "old_mount");
  assert.deepEqual(result.removedLinks.sort(), ["old_root", "old_tip"]);
  assert.deepEqual(result.removedJoints.sort(), ["old_joint", "old_mount"]);
  assert.match(result.content, /<link name="keep_me"\/>/);
  assert.doesNotMatch(result.content, /<link name="old_root"/);
  assert.doesNotMatch(result.content, /<link name="old_tip"/);
  assert.doesNotMatch(result.content, /<link name="world"/);
  assert.match(result.content, /<link name="kr1240_new__base">/);
  assert.match(result.content, /<link name="kr1240_new__tool"\/>/);
  assert.match(result.content, /<joint name="kr1240_new__tool_joint" type="continuous">/);
  assert.match(result.content, /<joint[^>]*name="old_mount"/);
  assert.match(result.content, /<joint[^>]*type="fixed"/);
  assert.match(result.content, /<parent link="mount_plate"\/>/);
  assert.match(result.content, /<child link="kr1240_new__base"\/>/);
  assert.match(result.content, /<origin[^>]*xyz="0.4 0.5 0.6"/);
  assert.match(result.content, /<origin[^>]*rpy="0 0 0"/);
});

test("replaceSubrobotInUrdf resolves normalized and case-insensitive link names", () => {
  const result = lib.replaceSubrobotInUrdf(hostUrdf, {
    targetRootLink: "OLD ROOT",
    replacementUrdfContent: replacementUrdf,
    replacementRootLink: "BASE",
    mountParentLink: "MOUNT PLATE",
    mountJointName: "OLD_MOUNT",
    prefix: "refresh",
  });

  assert.equal(result.success, true);
  assert.equal(result.mountParentLink, "mount_plate");
  assert.equal(result.mountJointName, "old_mount");
  assert.match(result.content, /<child link="refresh__base"\/>/);
});

test("replaceSubrobotInUrdf reports close matches when a requested root is not found", () => {
  const result = lib.replaceSubrobotInUrdf(hostUrdf, {
    targetRootLink: "old base",
    replacementUrdfContent: replacementUrdf,
    replacementRootLink: "base",
  });

  assert.equal(result.success, false);
  assert.match(result.error, /Target root link "old base" not found/i);
  assert.match(result.error, /"old_root"/i);
});

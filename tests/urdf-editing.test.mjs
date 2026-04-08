import test from "node:test";
import assert from "node:assert/strict";

import { lib } from "./helpers/loadDist.mjs";

const baseUrdf = `<?xml version="1.0" encoding="UTF-8"?>
<robot name="edit-test">
  <link name="base"/>
  <link name="tip"/>
  <joint name="mount" type="fixed">
    <parent link="base"/>
    <child link="tip"/>
  </joint>
</robot>`;

test("updateJointOriginInUrdf adds and updates a joint origin", () => {
  const first = lib.updateJointOriginInUrdf(
    baseUrdf,
    "mount",
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6]
  );

  assert.equal(first.success, true);
  assert.match(first.content, /<origin[^>]*xyz="0.1 0.2 0.3"[^>]*rpy="0.4 0.5 0.6"|<origin[^>]*rpy="0.4 0.5 0.6"[^>]*xyz="0.1 0.2 0.3"/);

  const second = lib.updateJointOriginInUrdf(
    first.content,
    "mount",
    [1, 2, 3],
    [0, 0, 1.57]
  );

  assert.equal(second.success, true);
  assert.match(second.content, /<origin[^>]*xyz="1 2 3"[^>]*rpy="0 0 1.57"|<origin[^>]*rpy="0 0 1.57"[^>]*xyz="1 2 3"/);
  assert.equal(second.content.match(/<origin /g)?.length ?? 0, 1);
});

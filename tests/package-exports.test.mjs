import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("node helper modules are available through public package exports", () => {
  const nodeDomRuntime = require("i-love-urdf/node-dom-runtime");
  const bundleMeshAssetsNode = require("i-love-urdf/bundle-mesh-assets-node");

  assert.equal(typeof nodeDomRuntime.installNodeDomGlobals, "function");
  assert.equal(typeof bundleMeshAssetsNode.bundleMeshAssetsForUrdfFile, "function");
});

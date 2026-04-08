import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { installDomGlobals } = await import(
  pathToFileURL(path.join(process.cwd(), "scripts", "install-dom-globals.mjs")).href
);

installDomGlobals();

test("bundleMeshAssetsForUrdfFile copies referenced meshes into a local assets folder", async (t) => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-bundle-assets-"));
  t.after(() => fs.rmSync(rootPath, { recursive: true, force: true }));

  fs.mkdirSync(path.join(rootPath, "urdf"), { recursive: true });
  fs.mkdirSync(path.join(rootPath, "meshes"), { recursive: true });
  fs.writeFileSync(
    path.join(rootPath, "package.xml"),
    '<?xml version="1.0"?><package><name>portable_robot_description</name></package>',
    "utf8"
  );
  fs.writeFileSync(path.join(rootPath, "meshes", "base.stl"), "solid base\nendsolid base\n", "utf8");

  const urdfPath = path.join(rootPath, "urdf", "robot.urdf");
  const urdfContent = `<robot name="portable_robot"><link name="base"><visual><geometry><mesh filename="../meshes/base.stl"/></geometry></visual></link></robot>`;
  fs.writeFileSync(urdfPath, urdfContent, "utf8");

  const outDir = path.join(rootPath, "out");
  const outPath = path.join(outDir, "portable.urdf");
  const bundleLib = await import(
    pathToFileURL(path.join(process.cwd(), "dist", "node", "bundleMeshAssets.js")).href
  );

  const result = bundleLib.bundleMeshAssetsForUrdfFile({
    urdfPath,
    urdfContent,
    outPath,
  });

  assert.equal(result.success, true);
  assert.equal(result.copiedFiles, 1);
  assert.deepEqual(result.unresolved, []);
  assert.match(result.content, /filename="assets\/meshes\/base\.stl"/);
  assert.equal(fs.existsSync(path.join(outDir, "assets", "meshes", "base.stl")), true);
});

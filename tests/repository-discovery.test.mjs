import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rootDir } from "./helpers/loadDist.mjs";

const { findPackageXmlForPackageName, findRepositoryUrdfCandidates } = await import(
  pathToFileURL(path.join(rootDir, "dist", "repository", "repositoryUrdfDiscovery.js")).href
);

test("repository discovery prefers package wrapper xacros over partial arm assemblies", () => {
  const files = [
    { path: "open_manipulator_description", type: "dir", name: "open_manipulator_description" },
    { path: "open_manipulator_description/meshes", type: "dir", name: "meshes" },
    { path: "open_manipulator_description/urdf", type: "dir", name: "urdf" },
    { path: "open_manipulator_description/urdf/omx_f", type: "dir", name: "omx_f" },
    {
      path: "open_manipulator_description/urdf/omx_f/omx_f_arm.urdf.xacro",
      type: "file",
      name: "omx_f_arm.urdf.xacro",
    },
    {
      path: "open_manipulator_description/urdf/omx_f/omx_f.urdf.xacro",
      type: "file",
      name: "omx_f.urdf.xacro",
    },
  ];

  const candidates = findRepositoryUrdfCandidates(files);
  assert.equal(candidates[0]?.path, "open_manipulator_description/urdf/omx_f/omx_f.urdf.xacro");
});

test("findPackageXmlForPackageName matches package roots at the repository top level", () => {
  const files = [
    {
      path: "xarm_description/package.xml",
      type: "file",
      name: "package.xml",
    },
    {
      path: "xarm_description/urdf/robot.urdf.xacro",
      type: "file",
      name: "robot.urdf.xacro",
    },
  ];

  assert.equal(
    findPackageXmlForPackageName(files, "xarm_description")?.path,
    "xarm_description/package.xml"
  );
});

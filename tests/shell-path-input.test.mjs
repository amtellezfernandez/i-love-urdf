import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { rootDir } from "./helpers/loadDist.mjs";

const shellPathInput = await import(
  pathToFileURL(path.join(rootDir, "dist", "commands", "shellPathInput.js")).href
);

test("normalizeShellInput preserves Windows path separators", () => {
  assert.equal(
    shellPathInput.normalizeShellInput("C:\\Users\\am\\robot.urdf"),
    "C:\\Users\\am\\robot.urdf"
  );
});

test("normalizeShellInput decodes escaped spaces without stripping real backslashes", () => {
  assert.equal(
    shellPathInput.normalizeShellInput("/tmp/robot\\ bundle/one.urdf"),
    "/tmp/robot bundle/one.urdf"
  );
});

test("normalizeFilesystemInput expands the user home directory from USERPROFILE", () => {
  assert.equal(
    shellPathInput.normalizeFilesystemInput("~/robot.urdf", {
      USERPROFILE: "C:\\Users\\robot",
    }),
    path.join("C:\\Users\\robot", "robot.urdf")
  );
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { rootDir } from "./helpers/loadDist.mjs";

const cliUpdate = await import(
  pathToFileURL(path.join(rootDir, "dist", "commands", "cliUpdate.js")).href
);
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));

test("forced newer version reports an available update", async () => {
  const result = await cliUpdate.checkForUpdateAvailability({
    env: {
      ...process.env,
      ILU_UPDATE_LATEST_VERSION: "99.0.0",
      ILU_DISABLE_UPDATE_CHECK_CACHE: "1",
    },
    useCache: false,
  });

  assert.ok(result);
  assert.equal(result.currentVersion, packageJson.version);
  assert.equal(result.latestVersion, "99.0.0");
  assert.match(result.installSpec, /github\.com\/amtellezfernandez\/i-love-urdf/i);
});

test("same forced version does not report an update", async () => {
  const result = await cliUpdate.checkForUpdateAvailability({
    env: {
      ...process.env,
      ILU_UPDATE_LATEST_VERSION: packageJson.version,
      ILU_DISABLE_UPDATE_CHECK_CACHE: "1",
    },
    useCache: false,
  });

  assert.equal(result, null);
});

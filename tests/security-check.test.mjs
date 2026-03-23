import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testsDir, "..");

test("security posture check passes without production install hooks", () => {
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts", "check-security-posture.mjs")], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /No install lifecycle hooks found in the production dependency graph/i);
  assert.match(result.stdout, /Managed XACRO runtime is pinned to xacro==2\.1\.1, PyYAML==6\.0\.3\./i);
});

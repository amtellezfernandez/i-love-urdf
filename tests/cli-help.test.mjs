import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testsDir, "..");
const cliPath = path.join(rootDir, "dist", "cli.js");
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*m/g;

const runHelp = (envOverrides = {}) => {
  const env = { ...process.env };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;

  return spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: rootDir,
    env: { ...env, ...envOverrides },
    encoding: "utf8",
  });
};

const stripAnsi = (text) => text.replace(ANSI_ESCAPE_PATTERN, "");

test("ilu --help stays readable without color", () => {
  const result = runHelp({ NO_COLOR: "1", FORCE_COLOR: "0", TERM: "xterm-256color" });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(ANSI_ESCAPE_PATTERN.test(result.stdout), false);
  assert.match(result.stdout, /^ILU CLI$/m);
  assert.match(result.stdout, /^Usage$/m);
  assert.match(result.stdout, /^Workflow$/m);
  assert.match(result.stdout, /^Load Sources$/m);
  assert.match(result.stdout, /^GitHub Auth$/m);
  assert.match(result.stdout, /^  load-source\s+--path <local-file-or-dir>/m);
});

test("ilu --help emits ANSI styling when color is forced", () => {
  const result = runHelp({ FORCE_COLOR: "1", TERM: "xterm-256color" });
  const plainOutput = stripAnsi(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, ANSI_ESCAPE_PATTERN);
  assert.match(plainOutput, /^ILU CLI$/m);
  assert.match(plainOutput, /^Token Resolution$/m);
  assert.match(plainOutput, /^Output$/m);
  assert.match(plainOutput, /^  normalize-robot\s+--urdf <path>/m);
});

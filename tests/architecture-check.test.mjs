import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testsDir, "..");
const scriptPath = path.join(rootDir, "scripts", "check-architecture.mjs");

test("architecture check emits a stable JSON contract", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--json"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");

  const report = JSON.parse(result.stdout);
  assert.equal(typeof report.generatedAt, "string");
  assert.equal(typeof report.summary.allPassed, "boolean");
  assert.equal(report.summary.allPassed, true);
  assert.equal(typeof report.summary.failingMetricCount, "number");
  assert.equal(typeof report.summary.totalMetricCount, "number");
  assert.equal(typeof report.summary.commandCount, "number");
  assert.equal(typeof report.summary.totalSourceLines, "number");
  assert.equal(typeof report.summary.reusableCoreRatio, "number");
  assert.equal(typeof report.summary.commandLayerRatio, "number");
  assert.equal(typeof report.summary.shellClusterLines, "number");
  assert.equal(typeof report.summary.largestSourceFile.path, "string");
  assert.equal(typeof report.summary.largestSourceFile.lines, "number");
  assert.ok(Array.isArray(report.sections));
  assert.ok(report.sections.length >= 4);

  const firstMetric = report.sections.flatMap((section) => section.metrics)[0];
  assert.equal(typeof firstMetric.id, "string");
  assert.equal(typeof firstMetric.label, "string");
  assert.ok(["<=", ">="].includes(firstMetric.comparator));
  assert.equal(typeof firstMetric.passed, "boolean");
});

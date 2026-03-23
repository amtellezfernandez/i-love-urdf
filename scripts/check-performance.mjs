#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(root, "dist", "cli.js");
const exampleUrdfPath = path.join(
  root,
  "examples",
  "orientation-card",
  "research_wheeled_z_up.urdf"
);

const DEFAULT_THRESHOLDS_MS = {
  help: 1200,
  shell: 1500,
  validate: 1200,
};

const SAMPLE_COUNT = 3;

const parseThreshold = (name, fallback) => {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} threshold: ${value}`);
  }

  return parsed;
};

const thresholdsMs = {
  help: parseThreshold("ILU_PERF_HELP_MS", DEFAULT_THRESHOLDS_MS.help),
  shell: parseThreshold("ILU_PERF_SHELL_MS", DEFAULT_THRESHOLDS_MS.shell),
  validate: parseThreshold("ILU_PERF_VALIDATE_MS", DEFAULT_THRESHOLDS_MS.validate),
};

const ensureFile = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const formatSample = (value) => `${value.toFixed(1)}ms`;

const runSample = (args, options = {}) => {
  const start = performance.now();
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
    input: options.input,
  });
  const elapsedMs = performance.now() - start;

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `Performance probe failed: node ${path.relative(root, cliPath)} ${args.join(" ")}${
        output ? `\n${output}` : ""
      }`
    );
  }

  return elapsedMs;
};

const measureProbe = ({ name, args, input, thresholdMs }) => {
  runSample(args, { input });

  const samples = Array.from({ length: SAMPLE_COUNT }, () => runSample(args, { input }));
  const medianMs = median(samples);
  const maxMs = Math.max(...samples);

  console.log(
    `[perf] ${name}: median ${formatSample(medianMs)} max ${formatSample(maxMs)} threshold ${formatSample(
      thresholdMs
    )} samples ${samples.map(formatSample).join(", ")}`
  );

  if (medianMs > thresholdMs) {
    throw new Error(
      `[perf] ${name} median ${formatSample(medianMs)} exceeded ${formatSample(thresholdMs)}`
    );
  }
};

ensureFile(cliPath, "built CLI");
ensureFile(exampleUrdfPath, "example URDF");

measureProbe({
  name: "help",
  args: ["help"],
  thresholdMs: thresholdsMs.help,
});

measureProbe({
  name: "shell-open-exit",
  args: [],
  input: "/exit\n",
  thresholdMs: thresholdsMs.shell,
});

measureProbe({
  name: "validate-example",
  args: ["validate", "--urdf", exampleUrdfPath],
  thresholdMs: thresholdsMs.validate,
});

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const distCommandCatalogPath = path.join(root, "dist", "commands", "commandCatalog.js");
const packageJsonPath = path.join(root, "package.json");
const emitJson = process.argv.includes("--json");

const BUDGETS = {
  publicSurface: {
    commandCountMax: 40,
    commandModuleCountMax: 34,
    exportPathCountMax: 10,
    binEntryCountMax: 1,
    prodDependencyCountMax: 6,
  },
  privilegedSurface: {
    filesystemTouchFilesMax: 22,
    subprocessTouchFilesMax: 8,
    networkTouchFilesMax: 10,
    rawTtyTouchFilesMax: 1,
    envTouchFilesMax: 12,
  },
  failureSurface: {
    totalSourceLinesMax: 36_000,
    largestSourceFileLinesMax: 9_600,
    shellClusterLinesMax: 10_900,
    filesOver500LinesMax: 14,
    filesOver1000LinesMax: 4,
    commandLayerRatioMax: 0.42,
    shellShareRatioMax: 0.31,
  },
  reuse: {
    reusableCoreRatioMin: 0.58,
    coreToShellRatioMin: 1.9,
  },
};

const collectFiles = (dirPath, extension) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath, extension));
      continue;
    }
    if (entry.isFile() && absolutePath.endsWith(extension)) {
      files.push(absolutePath);
    }
  }
  return files;
};

const readSourceFiles = () =>
  collectFiles(srcDir, ".ts").map((absolutePath) => {
    const text = fs.readFileSync(absolutePath, "utf8");
    const relativePath = path.relative(root, absolutePath);
    const lines = text.length === 0 ? 0 : text.split(/\r?\n/).length;
    return {
      absolutePath,
      relativePath,
      text,
      lines,
    };
  });

const countMatchingFiles = (files, pattern) => files.filter((file) => pattern.test(file.text)).length;

const sumLines = (files, predicate) =>
  files.reduce((total, file) => total + (predicate(file) ? file.lines : 0), 0);

const countFiles = (files, predicate) => files.filter(predicate).length;

const evaluateMaxMetric = ({ id, label, value, threshold, unit = null, detail = null }) => ({
  id,
  label,
  value,
  threshold,
  comparator: "<=",
  unit,
  detail,
  passed: value <= threshold,
});

const evaluateMinMetric = ({ id, label, value, threshold, unit = null, detail = null }) => ({
  id,
  label,
  value,
  threshold,
  comparator: ">=",
  unit,
  detail,
  passed: value >= threshold,
});

const formatMetricValue = (value, unit) => {
  if (unit === "percent") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (typeof value === "number" && !Number.isInteger(value)) {
    return value.toFixed(3);
  }
  return String(value);
};

const loadPackageJson = () => JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const loadCommandCatalog = () => {
  if (!fs.existsSync(distCommandCatalogPath)) {
    throw new Error(`Missing built command catalog: ${distCommandCatalogPath}. Run pnpm build:package first.`);
  }
  return require(distCommandCatalogPath).COMMAND_CATALOG;
};

const sourceFiles = readSourceFiles();
const packageJson = loadPackageJson();
const commandCatalog = loadCommandCatalog();

const totalSourceLines = sumLines(sourceFiles, () => true);
const commandLayerLines = sumLines(sourceFiles, (file) => file.relativePath.startsWith(path.join("src", "commands") + path.sep));
const shellClusterLines = sumLines(sourceFiles, (file) =>
  file.relativePath.startsWith(path.join("src", "commands") + path.sep) &&
  path.basename(file.relativePath).startsWith("cliShell")
);
const cliEntryFile = sourceFiles.find((file) => file.relativePath === path.join("src", "cli.ts"));
const cliEntryLines = cliEntryFile?.lines ?? 0;
const reusableCoreLines = totalSourceLines - commandLayerLines - cliEntryLines;
const commandLayerRatio = totalSourceLines === 0 ? 0 : commandLayerLines / totalSourceLines;
const shellShareRatio = totalSourceLines === 0 ? 0 : shellClusterLines / totalSourceLines;
const reusableCoreRatio = totalSourceLines === 0 ? 0 : reusableCoreLines / totalSourceLines;
const coreToShellRatio = shellClusterLines === 0 ? Number.POSITIVE_INFINITY : reusableCoreLines / shellClusterLines;

const largestSourceFile = sourceFiles.reduce((largest, file) => (file.lines > largest.lines ? file : largest), {
  relativePath: "none",
  lines: 0,
});

const privilegedPatterns = {
  filesystemTouchFiles: /node:fs|\bfs\./,
  subprocessTouchFiles: /node:child_process|spawnSync|execFileSync|execSync|spawn\(|execFile\(/,
  networkTouchFiles: /\bfetch\(|https:\/\/api\.github\.com|https:\/\/github\.com|node:https|node:http/,
  rawTtyTouchFiles: /setRawMode\(|emitKeypressEvents\(/,
  envTouchFiles: /process\.env/,
};

const metricsBySection = {
  publicSurface: [
    evaluateMaxMetric({
      id: "command-count",
      label: "CLI commands",
      value: Object.keys(commandCatalog).length,
      threshold: BUDGETS.publicSurface.commandCountMax,
    }),
    evaluateMaxMetric({
      id: "command-module-count",
      label: "Command-layer modules",
      value: countFiles(sourceFiles, (file) => file.relativePath.startsWith(path.join("src", "commands") + path.sep)),
      threshold: BUDGETS.publicSurface.commandModuleCountMax,
    }),
    evaluateMaxMetric({
      id: "export-path-count",
      label: "Package export paths",
      value: Object.keys(packageJson.exports ?? {}).length,
      threshold: BUDGETS.publicSurface.exportPathCountMax,
    }),
    evaluateMaxMetric({
      id: "bin-entry-count",
      label: "Global bin entries",
      value: Object.keys(packageJson.bin ?? {}).length,
      threshold: BUDGETS.publicSurface.binEntryCountMax,
    }),
    evaluateMaxMetric({
      id: "prod-dependency-count",
      label: "Production dependencies",
      value: Object.keys(packageJson.dependencies ?? {}).length,
      threshold: BUDGETS.publicSurface.prodDependencyCountMax,
    }),
  ],
  privilegedSurface: [
    evaluateMaxMetric({
      id: "filesystem-touch-files",
      label: "Filesystem-touching source files",
      value: countMatchingFiles(sourceFiles, privilegedPatterns.filesystemTouchFiles),
      threshold: BUDGETS.privilegedSurface.filesystemTouchFilesMax,
    }),
    evaluateMaxMetric({
      id: "subprocess-touch-files",
      label: "Subprocess-touching source files",
      value: countMatchingFiles(sourceFiles, privilegedPatterns.subprocessTouchFiles),
      threshold: BUDGETS.privilegedSurface.subprocessTouchFilesMax,
    }),
    evaluateMaxMetric({
      id: "network-touch-files",
      label: "Network-touching source files",
      value: countMatchingFiles(sourceFiles, privilegedPatterns.networkTouchFiles),
      threshold: BUDGETS.privilegedSurface.networkTouchFilesMax,
    }),
    evaluateMaxMetric({
      id: "raw-tty-touch-files",
      label: "Raw-TTY source files",
      value: countMatchingFiles(sourceFiles, privilegedPatterns.rawTtyTouchFiles),
      threshold: BUDGETS.privilegedSurface.rawTtyTouchFilesMax,
    }),
    evaluateMaxMetric({
      id: "env-touch-files",
      label: "Environment-sensitive source files",
      value: countMatchingFiles(sourceFiles, privilegedPatterns.envTouchFiles),
      threshold: BUDGETS.privilegedSurface.envTouchFilesMax,
    }),
  ],
  failureSurface: [
    evaluateMaxMetric({
      id: "total-source-lines",
      label: "TypeScript source lines",
      value: totalSourceLines,
      threshold: BUDGETS.failureSurface.totalSourceLinesMax,
    }),
    evaluateMaxMetric({
      id: "largest-source-file",
      label: "Largest source file",
      value: largestSourceFile.lines,
      threshold: BUDGETS.failureSurface.largestSourceFileLinesMax,
      detail: largestSourceFile.relativePath,
    }),
    evaluateMaxMetric({
      id: "shell-cluster-lines",
      label: "cliShell cluster lines",
      value: shellClusterLines,
      threshold: BUDGETS.failureSurface.shellClusterLinesMax,
    }),
    evaluateMaxMetric({
      id: "files-over-500-lines",
      label: "Source files over 500 lines",
      value: countFiles(sourceFiles, (file) => file.lines > 500),
      threshold: BUDGETS.failureSurface.filesOver500LinesMax,
    }),
    evaluateMaxMetric({
      id: "files-over-1000-lines",
      label: "Source files over 1000 lines",
      value: countFiles(sourceFiles, (file) => file.lines > 1000),
      threshold: BUDGETS.failureSurface.filesOver1000LinesMax,
    }),
    evaluateMaxMetric({
      id: "command-layer-ratio",
      label: "Command-layer share",
      value: commandLayerRatio,
      threshold: BUDGETS.failureSurface.commandLayerRatioMax,
      unit: "percent",
    }),
    evaluateMaxMetric({
      id: "shell-share-ratio",
      label: "Shell share",
      value: shellShareRatio,
      threshold: BUDGETS.failureSurface.shellShareRatioMax,
      unit: "percent",
    }),
  ],
  reuse: [
    evaluateMinMetric({
      id: "reusable-core-ratio",
      label: "Reusable core share",
      value: reusableCoreRatio,
      threshold: BUDGETS.reuse.reusableCoreRatioMin,
      unit: "percent",
    }),
    evaluateMinMetric({
      id: "core-to-shell-ratio",
      label: "Core-to-shell line ratio",
      value: coreToShellRatio,
      threshold: BUDGETS.reuse.coreToShellRatioMin,
    }),
  ],
};

const sections = [
  { id: "public-surface", title: "Public Surface", metrics: metricsBySection.publicSurface },
  { id: "privileged-surface", title: "Privileged Surface", metrics: metricsBySection.privilegedSurface },
  { id: "failure-surface", title: "Failure Surface", metrics: metricsBySection.failureSurface },
  { id: "reuse", title: "Reuse", metrics: metricsBySection.reuse },
];

const allMetrics = sections.flatMap((section) => section.metrics);
const failingMetrics = allMetrics.filter((metric) => !metric.passed);

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    allPassed: failingMetrics.length === 0,
    failingMetricCount: failingMetrics.length,
    totalMetricCount: allMetrics.length,
    commandCount: Object.keys(commandCatalog).length,
    totalSourceLines,
    reusableCoreRatio,
    commandLayerRatio,
    shellClusterLines,
    largestSourceFile: {
      path: largestSourceFile.relativePath,
      lines: largestSourceFile.lines,
    },
  },
  sections,
};

if (emitJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  for (const section of sections) {
    console.log(`[architecture] ${section.title}`);
    for (const metric of section.metrics) {
      const left = formatMetricValue(metric.value, metric.unit);
      const right = formatMetricValue(metric.threshold, metric.unit);
      const status = metric.passed ? "ok" : "fail";
      const detail = metric.detail ? ` (${metric.detail})` : "";
      console.log(`  [${status}] ${metric.label}: ${left} ${metric.comparator} ${right}${detail}`);
    }
  }
}

if (failingMetrics.length > 0) {
  const failureSummary = failingMetrics.map((metric) => metric.id).join(", ");
  throw new Error(`[architecture] ${failingMetrics.length} budget(s) failed: ${failureSummary}`);
}

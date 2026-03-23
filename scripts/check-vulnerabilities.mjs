#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corepackCommand = process.platform === "win32" ? "corepack.cmd" : "corepack";
const AUDIT_TIMEOUT_MS = 45_000;
const AUDIT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readFixturePayload = () => {
  const fixturePath = process.env.ILU_VULNERABILITY_AUDIT_FIXTURE?.trim();
  if (!fixturePath) {
    return null;
  }

  return JSON.parse(fs.readFileSync(path.resolve(fixturePath), "utf8"));
};

const runAuditCommand = async () => {
  let lastFailure = null;

  for (let attempt = 1; attempt <= AUDIT_ATTEMPTS; attempt += 1) {
    const result = spawnSync(corepackCommand, ["pnpm", "audit", "--prod", "--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: AUDIT_TIMEOUT_MS,
    });

    const stdout = result.stdout?.trim() || "";
    if (stdout) {
      return { status: result.status ?? 0, stdout };
    }

    const stderr = result.stderr?.trim() || "";
    lastFailure = stderr || result.error?.message || `pnpm audit exited with status ${result.status ?? "unknown"}`;
    if (attempt < AUDIT_ATTEMPTS) {
      await wait(RETRY_DELAY_MS);
    }
  }

  throw new Error(lastFailure || "pnpm audit produced no JSON output.");
};

const loadAuditPayload = async () => {
  const fixturePayload = readFixturePayload();
  if (fixturePayload) {
    return fixturePayload;
  }

  const { stdout } = await runAuditCommand();
  return JSON.parse(stdout);
};

const formatVulnerabilitySummary = (counts) =>
  ["critical", "high", "moderate", "low", "info"]
    .map((severity) => `${severity}=${counts[severity] ?? 0}`)
    .join(" ");

const main = async () => {
  const payload = await loadAuditPayload();
  const counts = payload?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== "object") {
    throw new Error("pnpm audit did not return a vulnerabilities summary.");
  }

  const total = ["critical", "high", "moderate", "low", "info"].reduce(
    (sum, severity) => sum + Number(counts[severity] ?? 0),
    0
  );

  if (total > 0) {
    console.error(`[vulnerabilities] Production dependency audit failed: ${formatVulnerabilitySummary(counts)}`);
    process.exit(1);
  }

  console.log("[vulnerabilities] No known production vulnerabilities found by pnpm audit.");
};

await main();

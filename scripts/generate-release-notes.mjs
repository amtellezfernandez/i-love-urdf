#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = path.join(root, "CHANGELOG.md");

const args = process.argv.slice(2);

const getArgValue = (name) => {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
};

const requestedVersion = getArgValue("--version")?.replace(/^v/i, "") ?? null;
const changelog = fs.readFileSync(changelogPath, "utf8");

const sections = Array.from(
  changelog.matchAll(/^##\s+([0-9][^\n]*)\n([\s\S]*?)(?=^##\s+[0-9]|\Z)/gm)
).map((match) => ({
  heading: match[1].trim(),
  body: match[2].trim(),
}));

if (sections.length === 0) {
  throw new Error("Could not find any version sections in CHANGELOG.md");
}

const selected =
  (requestedVersion
    ? sections.find((section) => section.heading.startsWith(requestedVersion))
    : sections[0]) ?? null;

if (!selected) {
  throw new Error(
    `Could not find a changelog section for version ${requestedVersion}`
  );
}

const version = selected.heading.split(/\s+-\s+/, 1)[0];
const highlights = selected.body
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter((line) => line.length > 0);

const notes = [
  `# ILU ${version}`,
  "",
  "## Highlights",
  ...highlights,
  "",
  "## Release Gates",
  "- Linux release gate passed locally before tagging: build, install-path checks, browser entry checks, tests, XACRO probe, smoke, performance, and real-repo verification.",
  "- CI enforces Linux multi-Node verification plus macOS and Windows build, install, browser, test, and smoke readiness.",
  "",
  "## Distribution",
  "- GitHub Release includes the packed npm tarball for this tag.",
  "- npm publish is attempted automatically when `NPM_TOKEN` is configured for the release workflow.",
];

process.stdout.write(`${notes.join("\n")}\n`);

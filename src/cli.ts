#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { JSDOM } from "jsdom";
import {
  canonicalOrderURDF,
  fixMeshPaths,
  normalizeJointAxes,
  parseMeshReference,
  prettyPrintURDF,
  rotateRobot90Degrees,
  validateUrdf,
} from "./index";
import { parseXml } from "./xmlDom";

type CommandName =
  | "validate"
  | "fix-mesh-paths"
  | "mesh-refs"
  | "canonical-order"
  | "pretty-print"
  | "normalize-axes"
  | "rotate-90"
  | "help";

type ArgMap = Map<string, string | boolean>;

const installDomGlobals = () => {
  if (typeof globalThis.DOMParser !== "undefined" && typeof globalThis.XMLSerializer !== "undefined") {
    return;
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.DOMParser = dom.window.DOMParser as unknown as typeof DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer as unknown as typeof XMLSerializer;
};

const readText = (filePath: string): string => fs.readFileSync(filePath, "utf8");

const writeText = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
};

const parseArgs = (argv: string[]): { rawCommand: string; command: CommandName; args: ArgMap } => {
  const [, , rawCommand = "help", ...rest] = argv;
  const command =
    rawCommand === "validate" ||
    rawCommand === "fix-mesh-paths" ||
    rawCommand === "mesh-refs" ||
    rawCommand === "canonical-order" ||
    rawCommand === "pretty-print" ||
    rawCommand === "normalize-axes" ||
    rawCommand === "rotate-90"
      ? rawCommand
      : "help";
  const args: ArgMap = new Map();

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    i += 1;
  }

  return { rawCommand, command, args };
};

const requireStringArg = (args: ArgMap, key: string): string => {
  const value = args.get(key);
  if (!value || value === true) {
    console.error(`Missing required argument --${key}`);
    process.exit(2);
  }
  return String(value);
};

const getOptionalStringArg = (args: ArgMap, key: string): string | undefined => {
  const value = args.get(key);
  if (!value || value === true) return undefined;
  return String(value);
};

const getOptionalNumberArg = (args: ArgMap, key: string): number | undefined => {
  const value = getOptionalStringArg(args, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    console.error(`Invalid numeric argument --${key}: ${value}`);
    process.exit(2);
  }
  return parsed;
};

const writeOutIfRequested = (outPath: string | undefined, content: string) => {
  if (!outPath) return;
  writeText(outPath, content);
};

const printHelp = () => {
  console.log(
    [
      "i-love-urdf CLI",
      "",
      "Commands:",
      "  validate --urdf <path>",
      "  fix-mesh-paths --urdf <path> [--package <name>] [--out <path>]",
      "  mesh-refs --urdf <path>",
      "  canonical-order --urdf <path> [--out <path>]",
      "  pretty-print --urdf <path> [--indent <n>] [--out <path>]",
      "  normalize-axes --urdf <path> [--out <path>]",
      "  rotate-90 --urdf <path> --axis <x|y|z> [--out <path>]",
      "",
      "All commands print JSON to stdout.",
    ].join("\n")
  );
};

const extractMeshRefs = (urdfContent: string) => {
  const doc = parseXml(urdfContent);
  const meshEls = Array.from(doc.querySelectorAll("mesh"));

  return meshEls
    .map((mesh) => mesh.getAttribute("filename") || "")
    .filter((ref) => ref.length > 0)
    .map((ref) => parseMeshReference(ref));
};

const run = () => {
  const { rawCommand, command, args } = parseArgs(process.argv);
  installDomGlobals();

  if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    printHelp();
    return;
  }

  const urdfPath = getOptionalStringArg(args, "urdf");
  if (!urdfPath) {
    printHelp();
    process.exit(2);
  }

  const urdfContent = readText(urdfPath);

  if (command === "validate") {
    const result = validateUrdf(urdfContent);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "fix-mesh-paths") {
    const packageName = getOptionalStringArg(args, "package");
    const outPath = getOptionalStringArg(args, "out");
    const result = fixMeshPaths(urdfContent, packageName);
    writeOutIfRequested(outPath, result.urdfContent);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "mesh-refs") {
    const refs = extractMeshRefs(urdfContent);
    console.log(JSON.stringify({ count: refs.length, refs }, null, 2));
    return;
  }

  if (command === "canonical-order") {
    const outPath = getOptionalStringArg(args, "out");
    const ordered = canonicalOrderURDF(urdfContent);
    writeOutIfRequested(outPath, ordered);
    console.log(JSON.stringify({ urdfContent: ordered, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "pretty-print") {
    const outPath = getOptionalStringArg(args, "out");
    const indent = getOptionalNumberArg(args, "indent") ?? 2;
    const pretty = prettyPrintURDF(urdfContent, indent);
    writeOutIfRequested(outPath, pretty);
    console.log(
      JSON.stringify({ urdfContent: pretty, indent, outPath: outPath || null }, null, 2)
    );
    return;
  }

  if (command === "normalize-axes") {
    const outPath = getOptionalStringArg(args, "out");
    const result = normalizeJointAxes(urdfContent);
    writeOutIfRequested(outPath, result.urdfContent);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "rotate-90") {
    const outPath = getOptionalStringArg(args, "out");
    const axisRaw = requireStringArg(args, "axis");
    if (axisRaw !== "x" && axisRaw !== "y" && axisRaw !== "z") {
      console.error(`Invalid --axis value: ${axisRaw}. Expected x, y, or z.`);
      process.exit(2);
    }
    const rotated = rotateRobot90Degrees(urdfContent, axisRaw);
    writeOutIfRequested(outPath, rotated);
    console.log(JSON.stringify({ urdfContent: rotated, axis: axisRaw, outPath: outPath || null }, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
};

run();

#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { JSDOM } from "jsdom";
import {
  inspectLocalRepositoryUrdfs,
  repairLocalRepositoryMeshReferences,
} from "./repository/localRepositoryInspection";
import {
  analyzeUrdf,
  canonicalOrderURDF,
  compareUrdfs,
  convertURDFToMJCF,
  convertURDFToXacro,
  fixMeshPaths,
  inspectGitHubRepositoryUrdfs,
  normalizeJointAxes,
  parseMeshReference,
  parseGitHubRepositoryReference,
  prettyPrintURDF,
  repairGitHubRepositoryMeshReferences,
  removeJointsFromUrdf,
  renameJointInUrdf,
  renameLinkInUrdf,
  rotateRobot90Degrees,
  updateJointLinksInUrdf,
  updateMaterialColorInUrdf,
  updateMeshPathsToAssetsInUrdf,
  validateUrdf,
} from "./index";
import { parseXml } from "./xmlDom";

const SUPPORTED_COMMANDS = [
  "validate",
  "analyze",
  "diff",
  "fix-mesh-paths",
  "mesh-refs",
  "canonical-order",
  "pretty-print",
  "normalize-axes",
  "rotate-90",
  "remove-joints",
  "reassign-joint",
  "set-material-color",
  "mesh-to-assets",
  "urdf-to-mjcf",
  "urdf-to-xacro",
  "rename-joint",
  "rename-link",
  "inspect-repo",
  "repair-mesh-refs",
] as const;

type SupportedCommandName = (typeof SUPPORTED_COMMANDS)[number];
type CommandName =
  | "validate"
  | "analyze"
  | "diff"
  | "fix-mesh-paths"
  | "mesh-refs"
  | "canonical-order"
  | "pretty-print"
  | "normalize-axes"
  | "rotate-90"
  | "remove-joints"
  | "reassign-joint"
  | "set-material-color"
  | "mesh-to-assets"
  | "urdf-to-mjcf"
  | "urdf-to-xacro"
  | "rename-joint"
  | "rename-link"
  | "inspect-repo"
  | "repair-mesh-refs"
  | "help";

type ArgMap = Map<string, string | boolean>;
const SUPPORTED_COMMAND_SET = new Set<string>(SUPPORTED_COMMANDS);

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
  const command = SUPPORTED_COMMAND_SET.has(rawCommand)
    ? (rawCommand as SupportedCommandName)
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

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const requireStringArg = (args: ArgMap, key: string): string => {
  const value = args.get(key);
  if (!value || value === true) {
    fail(`Missing required argument --${key}`);
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
    fail(`Invalid numeric argument --${key}: ${value}`);
  }
  return parsed;
};

const getDelimitedStringArg = (args: ArgMap, primaryKey: string, fallbackKey?: string): string[] => {
  const value =
    getOptionalStringArg(args, primaryKey) ??
    (fallbackKey ? getOptionalStringArg(args, fallbackKey) : undefined);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const requireHexColorArg = (args: ArgMap, key: string): string => {
  const value = requireStringArg(args, key).trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    fail(`Invalid hex color for --${key}: ${value}. Expected #RRGGBB.`);
  }
  return value;
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
      "  analyze --urdf <path>",
      "  diff --left <path> --right <path>",
      "  fix-mesh-paths --urdf <path> [--package <name>] [--out <path>]",
      "  mesh-refs --urdf <path>",
      "  canonical-order --urdf <path> [--out <path>]",
      "  pretty-print --urdf <path> [--indent <n>] [--out <path>]",
      "  normalize-axes --urdf <path> [--out <path>]",
      "  rotate-90 --urdf <path> --axis <x|y|z> [--out <path>]",
      "  remove-joints --urdf <path> --joints <a,b,c> [--out <path>]",
      "  reassign-joint --urdf <path> --joint <name> --parent <link> --child <link> [--out <path>]",
      "  set-material-color --urdf <path> --link <name> --material <name> --color <#RRGGBB> [--out <path>]",
      "  mesh-to-assets --urdf <path> [--out <path>]",
      "  urdf-to-mjcf --urdf <path> [--out <path>]",
      "  urdf-to-xacro --urdf <path> [--out <path>]",
      "  rename-joint --urdf <path> --joint <old> --name <new> [--out <path>]",
      "  rename-link --urdf <path> --link <old> --name <new> [--out <path>]",
      "  inspect-repo --local <path> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--max-candidates <n>] [--token <token>] [--out <path>]",
      "  repair-mesh-refs --local <repo|urdf-path> | --github <owner/repo|url> [--urdf <repo-path>] [--ref <branch>] [--path <subdir>] [--token <token>] [--out <path>]",
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

const run = async () => {
  const { rawCommand, command, args } = parseArgs(process.argv);
  installDomGlobals();

  if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    printHelp();
    return;
  }

  if (command === "inspect-repo") {
    const github = getOptionalStringArg(args, "github");
    const local = getOptionalStringArg(args, "local");
    if ((github ? 1 : 0) + (local ? 1 : 0) !== 1) {
      fail("inspect-repo requires exactly one of --github or --local.");
    }
    const outPath = getOptionalStringArg(args, "out");
    const maxCandidatesToInspect = getOptionalNumberArg(args, "max-candidates");
    const concurrency = getOptionalNumberArg(args, "concurrency");
    const result = local
      ? await inspectLocalRepositoryUrdfs(
          { path: local },
          {
            maxCandidatesToInspect,
            concurrency,
          }
        )
      : await (() => {
          const parsed = parseGitHubRepositoryReference(github || "");
          if (!parsed) {
            fail("Invalid --github value. Expected owner/repo or a GitHub repository URL.");
          }

          const pathOverride = getOptionalStringArg(args, "path");
          const refOverride = getOptionalStringArg(args, "ref");
          const accessToken =
            getOptionalStringArg(args, "token") ||
            process.env.GITHUB_TOKEN ||
            process.env.GH_TOKEN;

          return inspectGitHubRepositoryUrdfs(
            {
              ...parsed,
              path: pathOverride ?? parsed.path,
              ref: refOverride ?? parsed.ref,
            },
            {
              accessToken,
              maxCandidatesToInspect,
              concurrency,
            }
          );
        })();
    const payload = JSON.stringify(result, null, 2);
    writeOutIfRequested(outPath, payload);
    console.log(payload);
    return;
  }

  if (command === "repair-mesh-refs") {
    const github = getOptionalStringArg(args, "github");
    const local = getOptionalStringArg(args, "local");
    if ((github ? 1 : 0) + (local ? 1 : 0) !== 1) {
      fail("repair-mesh-refs requires exactly one of --github or --local.");
    }

    const requestedUrdfPath = getOptionalStringArg(args, "urdf");
    const outPath = getOptionalStringArg(args, "out");
    const result = local
      ? await repairLocalRepositoryMeshReferences(
          { path: local },
          {
            urdfPath: requestedUrdfPath,
          }
        )
      : await (() => {
          const parsed = parseGitHubRepositoryReference(github || "");
          if (!parsed) {
            fail("Invalid --github value. Expected owner/repo or a GitHub repository URL.");
          }

          const pathOverride = getOptionalStringArg(args, "path");
          const refOverride = getOptionalStringArg(args, "ref");
          const accessToken =
            getOptionalStringArg(args, "token") ||
            process.env.GITHUB_TOKEN ||
            process.env.GH_TOKEN;

          return repairGitHubRepositoryMeshReferences(
            {
              ...parsed,
              path: pathOverride ?? parsed.path,
              ref: refOverride ?? parsed.ref,
            },
            {
              accessToken,
              urdfPath: requestedUrdfPath,
            }
          );
        })();

    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "diff") {
    const leftPath = requireStringArg(args, "left");
    const rightPath = requireStringArg(args, "right");
    const result = compareUrdfs(readText(leftPath), readText(rightPath));
    console.log(
      JSON.stringify(
        { ...result, leftPath, rightPath },
        null,
        2
      )
    );
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

  if (command === "analyze") {
    const result = analyzeUrdf(urdfContent);
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

  if (command === "remove-joints") {
    const outPath = getOptionalStringArg(args, "out");
    const jointNames = getDelimitedStringArg(args, "joints", "joint");
    if (jointNames.length === 0) {
      fail("remove-joints requires --joints with at least one joint name");
    }
    const result = removeJointsFromUrdf(urdfContent, jointNames);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "reassign-joint") {
    const outPath = getOptionalStringArg(args, "out");
    const jointName = requireStringArg(args, "joint");
    const parentLink = requireStringArg(args, "parent");
    const childLink = requireStringArg(args, "child");
    const result = updateJointLinksInUrdf(urdfContent, jointName, parentLink, childLink);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "set-material-color") {
    const outPath = getOptionalStringArg(args, "out");
    const linkName = requireStringArg(args, "link");
    const materialName = requireStringArg(args, "material");
    const colorHex = requireHexColorArg(args, "color");
    const result = updateMaterialColorInUrdf(urdfContent, linkName, materialName, colorHex);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "mesh-to-assets") {
    const outPath = getOptionalStringArg(args, "out");
    const result = updateMeshPathsToAssetsInUrdf(urdfContent);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "urdf-to-mjcf") {
    const outPath = getOptionalStringArg(args, "out");
    const result = convertURDFToMJCF(urdfContent);
    writeOutIfRequested(outPath, result.mjcfContent);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "urdf-to-xacro") {
    const outPath = getOptionalStringArg(args, "out");
    const result = convertURDFToXacro(urdfContent);
    writeOutIfRequested(outPath, result.xacroContent);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "rename-joint") {
    const outPath = getOptionalStringArg(args, "out");
    const oldJointName = requireStringArg(args, "joint");
    const newJointName = requireStringArg(args, "name");
    const result = renameJointInUrdf(urdfContent, oldJointName, newJointName);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "rename-link") {
    const outPath = getOptionalStringArg(args, "out");
    const oldLinkName = requireStringArg(args, "link");
    const newLinkName = requireStringArg(args, "name");
    const result = renameLinkInUrdf(urdfContent, oldLinkName, newLinkName);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
};

run().catch((error) => {
  if (error instanceof Error) {
    fail(error.message);
  }
  fail("Unknown CLI failure");
});

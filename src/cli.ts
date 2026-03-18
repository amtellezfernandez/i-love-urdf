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
  guessUrdfOrientation,
  healthCheckUrdf,
  inspectGitHubRepositoryUrdfs,
  normalizeJointAxes,
  parseMeshReference,
  parseGitHubRepositoryReference,
  prettyPrintURDF,
  repairGitHubRepositoryMeshReferences,
  removeJointsFromUrdf,
  renameJointInUrdf,
  renameLinkInUrdf,
  setJointAxisInUrdf,
  updateJointLimitsInUrdf,
  updateJointTypeInUrdf,
  updateJointVelocityInUrdf,
  applyOrientationToRobot,
  rotateRobot90Degrees,
  snapJointAxes,
  updateJointLinksInUrdf,
  updateMaterialColorInUrdf,
  updateMeshPathsToAssetsInUrdf,
  validateUrdf,
} from "./index";
import { DEFAULT_MESH_COMPRESSION_MAX_FACES, compressMeshes } from "./mesh/mujocoMeshPrep";
import { inspectMeshes } from "./mesh/mujocoMeshPrep";
import { parseXml } from "./xmlDom";
import {
  expandGitHubRepositoryXacro,
  expandLocalXacroToUrdf,
  probeXacroRuntime,
  setupXacroRuntime,
} from "./xacro/xacroNode";
import { loadSourceFromGitHub, loadSourceFromPath } from "./sources/loadSourceNode";
import { TASK_FAMILIES } from "./tasks/taskFamilies";
import { canonicalizeJointFrames } from "./transforms/canonicalizeJointFrames";
import { normalizeRobot } from "./pipelines/normalizeRobot";

const SUPPORTED_COMMANDS = [
  "validate",
  "health-check",
  "analyze",
  "guess-orientation",
  "diff",
  "fix-mesh-paths",
  "mesh-refs",
  "canonical-order",
  "pretty-print",
  "normalize-axes",
  "snap-axes",
  "set-joint-axis",
  "set-joint-type",
  "set-joint-limits",
  "set-joint-velocity",
  "canonicalize-joint-frame",
  "rotate-90",
  "apply-orientation",
  "normalize-robot",
  "remove-joints",
  "reassign-joint",
  "set-material-color",
  "mesh-to-assets",
  "urdf-to-mjcf",
  "urdf-to-xacro",
  "xacro-to-urdf",
  "probe-xacro-runtime",
  "setup-xacro-runtime",
  "load-source",
  "rename-joint",
  "rename-link",
  "inspect-repo",
  "repair-mesh-refs",
  "inspect-meshes",
  "compress-meshes",
] as const;

type SupportedCommandName = (typeof SUPPORTED_COMMANDS)[number];
type CommandName =
  | "validate"
  | "health-check"
  | "analyze"
  | "guess-orientation"
  | "diff"
  | "fix-mesh-paths"
  | "mesh-refs"
  | "canonical-order"
  | "pretty-print"
  | "normalize-axes"
  | "snap-axes"
  | "set-joint-axis"
  | "set-joint-type"
  | "set-joint-limits"
  | "set-joint-velocity"
  | "canonicalize-joint-frame"
  | "rotate-90"
  | "apply-orientation"
  | "normalize-robot"
  | "remove-joints"
  | "reassign-joint"
  | "set-material-color"
  | "mesh-to-assets"
  | "urdf-to-mjcf"
  | "urdf-to-xacro"
  | "xacro-to-urdf"
  | "probe-xacro-runtime"
  | "setup-xacro-runtime"
  | "load-source"
  | "rename-joint"
  | "rename-link"
  | "inspect-repo"
  | "repair-mesh-refs"
  | "inspect-meshes"
  | "compress-meshes"
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

const getKeyValueArg = (args: ArgMap, primaryKey: string, fallbackKey?: string): Record<string, string> => {
  const value =
    getOptionalStringArg(args, primaryKey) ??
    (fallbackKey ? getOptionalStringArg(args, fallbackKey) : undefined);
  if (!value) return {};

  const pairs = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      fail(`Invalid key=value pair: ${pair}`);
    }
    const key = pair.slice(0, separatorIndex).trim();
    const mappedValue = pair.slice(separatorIndex + 1).trim();
    if (!key) {
      fail(`Invalid key=value pair: ${pair}`);
    }
    result[key] = mappedValue;
  }
  return result;
};

const getNumericKeyValueArg = (
  args: ArgMap,
  primaryKey: string,
  fallbackKey?: string
): Record<string, number> => {
  const raw = getKeyValueArg(args, primaryKey, fallbackKey);
  const numeric: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      fail(`Invalid numeric value for ${key}: ${value}`);
    }
    numeric[key] = parsed;
  }
  return numeric;
};

const parseTripletArg = (raw: string, label: string): [number, number, number] => {
  const parts = raw
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((value) => Number(value));
  if (
    parts.length !== 3 ||
    !Number.isFinite(parts[0]) ||
    !Number.isFinite(parts[1]) ||
    !Number.isFinite(parts[2])
  ) {
    fail(`Invalid ${label}: ${raw}. Expected three numeric values like "0 1 0".`);
  }
  return [parts[0], parts[1], parts[2]];
};

const getAxisSpecArg = (
  args: ArgMap,
  key: string
): "x" | "y" | "z" | "+x" | "+y" | "+z" | "-x" | "-y" | "-z" | undefined => {
  const value = getOptionalStringArg(args, key);
  if (!value) return undefined;
  if (
    value === "x" ||
    value === "y" ||
    value === "z" ||
    value === "+x" ||
    value === "+y" ||
    value === "+z" ||
    value === "-x" ||
    value === "-y" ||
    value === "-z"
  ) {
    return value;
  }
  fail(`Invalid --${key} value: ${value}. Expected x, y, z, +x, +y, +z, -x, -y, or -z.`);
};

const getSimpleAxisArg = (
  args: ArgMap,
  key: string
): "x" | "y" | "z" | undefined => {
  const value = getOptionalStringArg(args, key);
  if (!value) return undefined;
  if (value === "x" || value === "y" || value === "z") {
    return value;
  }
  fail(`Invalid --${key} value: ${value}. Expected x, y, or z.`);
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

const inspectLocalMjcfMeshRisks = (urdfPath: string, urdfContent: string): string[] => {
  const doc = parseXml(urdfContent);
  const urdfDir = path.dirname(path.resolve(urdfPath));
  const riskyMeshes = new Map<string, { meshPath: string; faceCount: number; meshDir: string }>();

  for (const meshElement of Array.from(doc.querySelectorAll("mesh"))) {
    const rawRef = meshElement.getAttribute("filename");
    if (!rawRef) continue;
    const parsedRef = parseMeshReference(rawRef);
    const refPath = parsedRef.path || parsedRef.raw;
    const lowerRefPath = refPath.toLowerCase();
    if (!lowerRefPath.endsWith(".stl")) continue;

    let absoluteMeshPath = "";
    if (parsedRef.scheme === "file" && parsedRef.isAbsoluteFile) {
      absoluteMeshPath = parsedRef.path;
    } else if (parsedRef.scheme === null || (parsedRef.scheme === "file" && !parsedRef.isAbsoluteFile)) {
      absoluteMeshPath = path.resolve(urdfDir, refPath);
    } else {
      continue;
    }

    if (!fs.existsSync(absoluteMeshPath) || !fs.statSync(absoluteMeshPath).isFile()) {
      continue;
    }

    const buffer = fs.readFileSync(absoluteMeshPath);
    if (buffer.length < 84) continue;
    const faceCount = buffer.readUInt32LE(80);
    if (faceCount <= DEFAULT_MESH_COMPRESSION_MAX_FACES) continue;

    riskyMeshes.set(absoluteMeshPath, {
      meshPath: absoluteMeshPath,
      faceCount,
      meshDir: path.dirname(absoluteMeshPath),
    });
  }

  if (riskyMeshes.size === 0) {
    return [];
  }

  const riskyMeshList = Array.from(riskyMeshes.values());
  if (riskyMeshList.length === 0) {
    return [];
  }

  const meshDirs = Array.from(new Set(riskyMeshList.map((mesh) => mesh.meshDir)));
  const commandHint =
    meshDirs.length === 1
      ? ` Inspect: ilu inspect-meshes --mesh-dir ${meshDirs[0]}. Fix: ilu compress-meshes --mesh-dir ${meshDirs[0]} --in-place`
      : " Inspect those mesh directories with inspect-meshes, then run compress-meshes on the ones that contain the failing STL files.";
  const meshSummary = riskyMeshList
    .slice(0, 3)
    .map((mesh) => `${path.basename(mesh.meshPath)} (${mesh.faceCount} faces)`)
    .join(", ");
  return [
    `Detected ${riskyMeshList.length} STL mesh${riskyMeshList.length === 1 ? "" : "es"} above the likely MuJoCo face limit of ${DEFAULT_MESH_COMPRESSION_MAX_FACES}. MuJoCo will likely fail to load them: ${meshSummary}.${commandHint}`,
  ];
};

const printHelp = () => {
  const familySections = TASK_FAMILIES.map((family) => {
    const commandLines = family.commands.map((commandName) => {
      switch (commandName) {
        case "load-source":
          return [
            "  load-source --path <local-file-or-dir> [--entry <repo-path>] [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
            "  load-source --github <owner/repo|url> [--entry <repo-path>] [--ref <branch>] [--subdir <path>] [--token <token>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
          ].join("\n");
        case "inspect-repo":
          return "  inspect-repo --local <path> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--max-candidates <n>] [--token <token>] [--out <path>]";
        case "validate":
          return "  validate --urdf <path>";
        case "health-check":
          return "  health-check --urdf <path> [--strict]";
        case "analyze":
          return "  analyze --urdf <path>";
        case "guess-orientation":
          return "  guess-orientation --urdf <path> [--target-up <x|y|z>] [--target-forward <x|y|z>]";
        case "mesh-refs":
          return "  mesh-refs --urdf <path>";
        case "diff":
          return "  diff --left <path> --right <path>";
        case "pretty-print":
          return "  pretty-print --urdf <path> [--indent <n>] [--out <path>]";
        case "canonical-order":
          return "  canonical-order --urdf <path> [--out <path>]";
        case "normalize-axes":
          return "  normalize-axes --urdf <path> [--out <path>]";
        case "snap-axes":
          return "  snap-axes --urdf <path> [--tolerance <n>] [--out <path>]";
        case "set-joint-axis":
          return "  set-joint-axis --urdf <path> --joint <name> --xyz \"0 1 0\" [--out <path>]";
        case "set-joint-type":
          return "  set-joint-type --urdf <path> --joint <name> --type <revolute|continuous|prismatic|fixed|floating|planar> [--lower <n>] [--upper <n>] [--out <path>]";
        case "set-joint-limits":
          return "  set-joint-limits --urdf <path> --joint <name> --lower <n> --upper <n> [--out <path>]";
        case "set-joint-velocity":
          return "  set-joint-velocity --urdf <path> --joint <name> --velocity <n> [--out <path>]";
        case "canonicalize-joint-frame":
          return "  canonicalize-joint-frame --urdf <path> [--target-axis <x|y|z>] [--joint <name> | --joints <a,b,c>] [--out <path>]";
        case "rename-joint":
          return "  rename-joint --urdf <path> --joint <old> --name <new> [--out <path>]";
        case "rename-link":
          return "  rename-link --urdf <path> --link <old> --name <new> [--out <path>]";
        case "reassign-joint":
          return "  reassign-joint --urdf <path> --joint <name> --parent <link> --child <link> [--out <path>]";
        case "remove-joints":
          return "  remove-joints --urdf <path> --joints <a,b,c> [--out <path>]";
        case "set-material-color":
          return "  set-material-color --urdf <path> --link <name> --material <name> --color <#RRGGBB> [--out <path>]";
        case "rotate-90":
          return "  rotate-90 --urdf <path> --axis <x|y|z> [--out <path>]";
        case "apply-orientation":
          return "  apply-orientation --urdf <path> --source-up <axis> --source-forward <axis> [--target-up <axis>] [--target-forward <axis>] [--out <path>]";
        case "normalize-robot":
          return "  normalize-robot --urdf <path> [--apply] [--snap-axes] [--canonicalize-joint-frame] [--target-axis <x|y|z>] [--source-up <axis>] [--source-forward <axis>] [--target-up <axis>] [--target-forward <axis>] [--pretty-print] [--canonical-order] [--out <path>]";
        case "fix-mesh-paths":
          return "  fix-mesh-paths --urdf <path> [--package <name>] [--out <path>]";
        case "mesh-to-assets":
          return "  mesh-to-assets --urdf <path> [--out <path>]";
        case "repair-mesh-refs":
          return "  repair-mesh-refs --local <repo|urdf-path> | --github <owner/repo|url> [--urdf <repo-path>] [--ref <branch>] [--path <subdir>] [--token <token>] [--out <path>]";
        case "inspect-meshes":
          return "  inspect-meshes --mesh-dir <path> [--max-faces <n>] [--meshes <a.stl,b.stl>] [--limits <a.stl=100000,b.stl=50000>]";
        case "compress-meshes":
          return "  compress-meshes --mesh-dir <path> [--max-faces <n>] [--meshes <a.stl,b.stl>] [--limits <a.stl=100000,b.stl=50000>] [--in-place | --out-dir <path>]";
        case "urdf-to-mjcf":
          return "  urdf-to-mjcf --urdf <path> [--out <path>]";
        case "urdf-to-xacro":
          return "  urdf-to-xacro --urdf <path> [--out <path>]";
        case "xacro-to-urdf":
          return [
            "  xacro-to-urdf --xacro <path> [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
            "  xacro-to-urdf --local <repo> --entry <repo-path> [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
            "  xacro-to-urdf --github <owner/repo|url> --entry <repo-path> [--ref <branch>] [--path <subdir>] [--token <token>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
          ].join("\n");
        default:
          return "";
      }
    });

    return [family.title, `  ${family.summary}`, ...commandLines].join("\n");
  });

  console.log(
    [
      "ilu CLI",
      "",
      "Source-first workflow:",
      "  1. load-source or inspect-repo",
      "  2. validate / analyze / edit / optimize / convert",
      "",
      ...familySections,
      "",
      "XACRO runtime support",
      "  probe-xacro-runtime [--python <path>] [--wheel <path>]",
      "  setup-xacro-runtime [--python <path>] [--venv <path>]",
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

  if (args.has("help")) {
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

  if (command === "xacro-to-urdf") {
    const github = getOptionalStringArg(args, "github");
    const local = getOptionalStringArg(args, "local");
    if ((github ? 1 : 0) + (local ? 1 : 0) > 1) {
      fail("xacro-to-urdf accepts at most one of --github or --local.");
    }

    const xacroPath = getOptionalStringArg(args, "xacro") ?? getOptionalStringArg(args, "entry");
    if (!xacroPath) {
      fail("Missing required argument --xacro (or --entry for repository sources).");
    }
    const outPath = getOptionalStringArg(args, "out");
    const runtimeOptions = {
      pythonExecutable: getOptionalStringArg(args, "python"),
      wheelPath: getOptionalStringArg(args, "wheel"),
    };
    const runtimeArgs = getKeyValueArg(args, "args", "arg");
    const useInorder = !Boolean(args.get("no-inorder"));

    const result = local
      ? await expandLocalXacroToUrdf({
          xacroPath: path.resolve(local, xacroPath),
          rootPath: local,
          args: runtimeArgs,
          useInorder,
          ...runtimeOptions,
        })
      : github
        ? await (() => {
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

            return expandGitHubRepositoryXacro(
              {
                ...parsed,
                path: pathOverride ?? parsed.path,
                ref: refOverride ?? parsed.ref,
              },
              {
                targetPath: xacroPath,
                accessToken,
                args: runtimeArgs,
                useInorder,
                ...runtimeOptions,
              }
            );
          })()
        : await expandLocalXacroToUrdf({
            xacroPath,
            rootPath: getOptionalStringArg(args, "root"),
            args: runtimeArgs,
            useInorder,
            ...runtimeOptions,
          });

    writeOutIfRequested(outPath, result.urdf);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "probe-xacro-runtime") {
    const result = await probeXacroRuntime({
      pythonExecutable: getOptionalStringArg(args, "python"),
      wheelPath: getOptionalStringArg(args, "wheel"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "setup-xacro-runtime") {
    const result = await setupXacroRuntime({
      pythonExecutable: getOptionalStringArg(args, "python"),
      venvPath: getOptionalStringArg(args, "venv"),
      wheelPath: getOptionalStringArg(args, "wheel"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "load-source") {
    const localPath = getOptionalStringArg(args, "path");
    const github = getOptionalStringArg(args, "github");
    if ((localPath ? 1 : 0) + (github ? 1 : 0) !== 1) {
      fail("load-source requires exactly one of --path or --github.");
    }

    const outPath = getOptionalStringArg(args, "out");
    const runtimeOptions = {
      pythonExecutable: getOptionalStringArg(args, "python"),
      wheelPath: getOptionalStringArg(args, "wheel"),
    };
    const runtimeArgs = getKeyValueArg(args, "args", "arg");
    const useInorder = !Boolean(args.get("no-inorder"));
    const entryPath = getOptionalStringArg(args, "entry");
    const maxCandidatesToInspect = getOptionalNumberArg(args, "max-candidates");
    const concurrency = getOptionalNumberArg(args, "concurrency");

    const result = localPath
      ? await loadSourceFromPath({
          path: localPath,
          entryPath,
          rootPath: getOptionalStringArg(args, "root"),
          args: runtimeArgs,
          useInorder,
          maxCandidatesToInspect,
          concurrency,
          ...runtimeOptions,
        })
      : await (() => {
          const parsed = parseGitHubRepositoryReference(github || "");
          if (!parsed) {
            fail("Invalid --github value. Expected owner/repo or a GitHub repository URL.");
          }

          const subdirOverride = getOptionalStringArg(args, "subdir");
          const refOverride = getOptionalStringArg(args, "ref");
          const accessToken =
            getOptionalStringArg(args, "token") ||
            process.env.GITHUB_TOKEN ||
            process.env.GH_TOKEN;

          return loadSourceFromGitHub({
            reference: {
              ...parsed,
              path: subdirOverride ?? parsed.path,
              ref: refOverride ?? parsed.ref,
            },
            entryPath,
            accessToken,
            args: runtimeArgs,
            useInorder,
            maxCandidatesToInspect,
            concurrency,
            ...runtimeOptions,
          });
        })();

    writeOutIfRequested(outPath, result.urdf);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
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

  if (command === "inspect-meshes") {
    const meshDir = requireStringArg(args, "mesh-dir");
    const maxFaces = getOptionalNumberArg(args, "max-faces");
    const meshes = getDelimitedStringArg(args, "meshes", "mesh");
    const limits = getNumericKeyValueArg(args, "limits", "limit");
    const result = inspectMeshes({
      meshDir,
      maxFaces,
      meshes,
      limits,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "compress-meshes") {
    const meshDir = requireStringArg(args, "mesh-dir");
    const outDir = getOptionalStringArg(args, "out-dir");
    const inPlace = Boolean(args.get("in-place"));
    const maxFaces = getOptionalNumberArg(args, "max-faces");
    const meshes = getDelimitedStringArg(args, "meshes", "mesh");
    const limits = getNumericKeyValueArg(args, "limits", "limit");
    if (inPlace && outDir) {
      fail("compress-meshes accepts either --in-place or --out-dir, not both.");
    }
    const result = compressMeshes({
      meshDir,
      maxFaces,
      meshes,
      limits,
      inPlace,
      outDir,
    });
    console.log(JSON.stringify(result, null, 2));
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

  if (command === "health-check") {
    const result = healthCheckUrdf(urdfContent);
    console.log(JSON.stringify(result, null, 2));
    if (Boolean(args.get("strict")) && !result.ok) {
      process.exit(1);
    }
    return;
  }

  if (command === "analyze") {
    const result = analyzeUrdf(urdfContent);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "guess-orientation") {
    const targetUpAxisRaw = getOptionalStringArg(args, "target-up");
    const targetForwardAxisRaw = getOptionalStringArg(args, "target-forward");
    if (
      targetUpAxisRaw &&
      targetUpAxisRaw !== "x" &&
      targetUpAxisRaw !== "y" &&
      targetUpAxisRaw !== "z"
    ) {
      fail(`Invalid --target-up value: ${targetUpAxisRaw}. Expected x, y, or z.`);
    }
    if (
      targetForwardAxisRaw &&
      targetForwardAxisRaw !== "x" &&
      targetForwardAxisRaw !== "y" &&
      targetForwardAxisRaw !== "z"
    ) {
      fail(`Invalid --target-forward value: ${targetForwardAxisRaw}. Expected x, y, or z.`);
    }
    const targetUpAxis = targetUpAxisRaw as "x" | "y" | "z" | undefined;
    const targetForwardAxis = targetForwardAxisRaw as "x" | "y" | "z" | undefined;
    const result = guessUrdfOrientation(urdfContent, {
      targetUpAxis,
      targetForwardAxis,
    });
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

  if (command === "snap-axes") {
    const outPath = getOptionalStringArg(args, "out");
    const tolerance = getOptionalNumberArg(args, "tolerance");
    const result = snapJointAxes(urdfContent, {
      snapTolerance: tolerance,
    });
    writeOutIfRequested(outPath, result.urdfContent);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "set-joint-axis") {
    const outPath = getOptionalStringArg(args, "out");
    const jointName = requireStringArg(args, "joint");
    const xyz = parseTripletArg(requireStringArg(args, "xyz"), "joint axis");
    const result = setJointAxisInUrdf(urdfContent, jointName, xyz);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "set-joint-type") {
    const outPath = getOptionalStringArg(args, "out");
    const jointName = requireStringArg(args, "joint");
    const jointType = requireStringArg(args, "type");
    const lowerLimit = getOptionalNumberArg(args, "lower");
    const upperLimit = getOptionalNumberArg(args, "upper");
    const result = updateJointTypeInUrdf(urdfContent, jointName, jointType, lowerLimit, upperLimit);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "set-joint-limits") {
    const outPath = getOptionalStringArg(args, "out");
    const jointName = requireStringArg(args, "joint");
    const lowerLimit = getOptionalNumberArg(args, "lower");
    const upperLimit = getOptionalNumberArg(args, "upper");
    const result = updateJointLimitsInUrdf(urdfContent, jointName, lowerLimit, upperLimit);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "set-joint-velocity") {
    const outPath = getOptionalStringArg(args, "out");
    const jointName = requireStringArg(args, "joint");
    const velocity = getOptionalNumberArg(args, "velocity");
    if (velocity === undefined) {
      fail("set-joint-velocity requires --velocity.");
    }
    const result = updateJointVelocityInUrdf(urdfContent, jointName, velocity);
    writeOutIfRequested(outPath, result.content);
    console.log(JSON.stringify({ ...result, outPath: outPath || null }, null, 2));
    return;
  }

  if (command === "canonicalize-joint-frame") {
    const outPath = getOptionalStringArg(args, "out");
    const targetAxis = getSimpleAxisArg(args, "target-axis") ?? "z";
    const jointNames = getDelimitedStringArg(args, "joints", "joint");
    const result = canonicalizeJointFrames(urdfContent, {
      targetAxis,
      joints: jointNames.length > 0 ? jointNames : undefined,
    });
    writeOutIfRequested(outPath, result.content);
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

  if (command === "apply-orientation") {
    const outPath = getOptionalStringArg(args, "out");
    const sourceUpAxis = getAxisSpecArg(args, "source-up");
    const sourceForwardAxis = getAxisSpecArg(args, "source-forward");
    if (!sourceUpAxis || !sourceForwardAxis) {
      fail("apply-orientation requires --source-up and --source-forward.");
    }
    const targetUpAxis = getAxisSpecArg(args, "target-up");
    const targetForwardAxis = getAxisSpecArg(args, "target-forward");
    const rotated = applyOrientationToRobot(urdfContent, {
      sourceUpAxis,
      sourceForwardAxis,
      targetUpAxis,
      targetForwardAxis,
    });
    writeOutIfRequested(outPath, rotated);
    console.log(
      JSON.stringify(
        {
          urdfContent: rotated,
          sourceUpAxis,
          sourceForwardAxis,
          targetUpAxis: targetUpAxis || "z",
          targetForwardAxis: targetForwardAxis || "x",
          outPath: outPath || null,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "normalize-robot") {
    const outPath = getOptionalStringArg(args, "out");
    const result = normalizeRobot(urdfContent, {
      apply: Boolean(args.get("apply")),
      snapAxes: Boolean(args.get("snap-axes")),
      canonicalizeJointFrame: Boolean(args.get("canonicalize-joint-frame")),
      targetJointAxis: getSimpleAxisArg(args, "target-axis"),
      sourceUpAxis: getAxisSpecArg(args, "source-up"),
      sourceForwardAxis: getAxisSpecArg(args, "source-forward"),
      targetUpAxis: getAxisSpecArg(args, "target-up"),
      targetForwardAxis: getAxisSpecArg(args, "target-forward"),
      prettyPrint: Boolean(args.get("pretty-print")),
      canonicalOrder: Boolean(args.get("canonical-order")),
      axisSnapTolerance: getOptionalNumberArg(args, "tolerance"),
    });
    if (result.apply && result.outputUrdf && outPath) {
      writeOutIfRequested(outPath, result.outputUrdf);
    }
    console.log(
      JSON.stringify(
        {
          ...result,
          outPath: outPath || null,
        },
        null,
        2
      )
    );
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
    result.warnings.push(...inspectLocalMjcfMeshRisks(urdfPath, urdfContent));
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

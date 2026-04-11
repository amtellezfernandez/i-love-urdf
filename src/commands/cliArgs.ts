import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import type { CliArgMap, CliArgValue, CliCommandHelpers } from "./commandHelpers";
import { SUPPORTED_COMMANDS, type CommandName, type SupportedCommandName } from "./commandCatalog";

export type ParsedCliArgs = {
  rawCommand: string;
  command: CommandName;
  args: CliArgMap;
  positionals: readonly string[];
};

const SUPPORTED_COMMAND_SET = new Set<string>(SUPPORTED_COMMANDS);
const AXIS_SPEC_VALUES = ["x", "y", "z", "+x", "+y", "+z", "-x", "-y", "-z"] as const;
const AXIS_SPEC_SET = new Set<string>(AXIS_SPEC_VALUES);
const SIMPLE_AXIS_VALUES = ["x", "y", "z"] as const;
const SIMPLE_AXIS_SET = new Set<string>(SIMPLE_AXIS_VALUES);
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const readText = (filePath: string): string => fs.readFileSync(filePath, "utf8");

const writeText = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
};

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const coerceArgValues = (value: CliArgValue | CliArgValue[] | undefined): CliArgValue[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const getStringArgValues = (args: CliArgMap, key: string): string[] =>
  coerceArgValues(args.get(key)).filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );

const getLastStringArg = (args: CliArgMap, key: string): string | undefined => {
  const values = getStringArgValues(args, key);
  return values[values.length - 1];
};

const requireStringArg = (args: CliArgMap, key: string): string => {
  const value = getLastStringArg(args, key);
  if (!value) {
    fail(`Missing required argument --${key}`);
  }
  return value;
};

const getOptionalStringArg = (args: CliArgMap, key: string): string | undefined => {
  return getLastStringArg(args, key);
};

const getOptionalNumberArg = (args: CliArgMap, key: string): number | undefined => {
  const value = getOptionalStringArg(args, key);
  if (value === undefined) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    fail(`Invalid numeric argument --${key}: ${value}`);
  }
  return parsed;
};

const getDelimitedStringArg = (args: CliArgMap, primaryKey: string, fallbackKey?: string): string[] => {
  const values = getStringArgValues(args, primaryKey);
  if (values.length === 0 && fallbackKey) {
    values.push(...getStringArgValues(args, fallbackKey));
  }
  if (values.length === 0) return [];

  return values.flatMap((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );
};

const getKeyValueArg = (args: CliArgMap, primaryKey: string, fallbackKey?: string): Record<string, string> => {
  const values = getStringArgValues(args, primaryKey);
  if (values.length === 0 && fallbackKey) {
    values.push(...getStringArgValues(args, fallbackKey));
  }
  if (values.length === 0) return {};

  const result: Record<string, string> = {};
  for (const pair of values.flatMap((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  )) {
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
  args: CliArgMap,
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
  args: CliArgMap,
  key: string
): (typeof AXIS_SPEC_VALUES)[number] | undefined => {
  const value = getOptionalStringArg(args, key);
  if (!value) return undefined;
  if (AXIS_SPEC_SET.has(value)) {
    return value as (typeof AXIS_SPEC_VALUES)[number];
  }

  fail(`Invalid --${key} value: ${value}. Expected x, y, z, +x, +y, +z, -x, -y, or -z.`);
};

const getSimpleAxisArg = (
  args: CliArgMap,
  key: string
): (typeof SIMPLE_AXIS_VALUES)[number] | undefined => {
  const value = getOptionalStringArg(args, key);
  if (!value) return undefined;
  if (SIMPLE_AXIS_SET.has(value)) {
    return value as (typeof SIMPLE_AXIS_VALUES)[number];
  }

  fail(`Invalid --${key} value: ${value}. Expected x, y, or z.`);
};

const requireHexColorArg = (args: CliArgMap, key: string): string => {
  const value = requireStringArg(args, key).trim();
  if (!HEX_COLOR_PATTERN.test(value)) {
    fail(`Invalid hex color for --${key}: ${value}. Expected #RRGGBB.`);
  }
  return value;
};

const writeOutIfRequested = (outPath: string | undefined, content: string) => {
  if (!outPath) return;
  writeText(outPath, content);
};

export const parseArgs = (argv: string[]): ParsedCliArgs => {
  const [, , rawCommand = "help", ...rest] = argv;
  const command = SUPPORTED_COMMAND_SET.has(rawCommand)
    ? (rawCommand as SupportedCommandName)
    : "help";
  const args: CliArgMap = new Map();
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const nextToken = rest[index + 1];
    const appendArg = (value: CliArgValue) => {
      const previous = args.get(key);
      if (previous === undefined) {
        args.set(key, value);
        return;
      }
      args.set(key, [...coerceArgValues(previous), value]);
    };
    if (!nextToken || nextToken.startsWith("--")) {
      appendArg(true);
      continue;
    }

    appendArg(nextToken);
    index += 1;
  }

  return { rawCommand, command, args, positionals };
};

export const createCliCommandHelpers = (): CliCommandHelpers => ({
  fail,
  readText,
  requireStringArg,
  getOptionalStringArg,
  getOptionalNumberArg,
  getDelimitedStringArg,
  getKeyValueArg,
  getNumericKeyValueArg,
  parseTripletArg,
  getAxisSpecArg,
  getSimpleAxisArg,
  requireHexColorArg,
  writeOutIfRequested,
});

import * as os from "node:os";
import * as path from "node:path";

export const getHomeDirectory = (env: NodeJS.ProcessEnv = process.env): string => {
  const envHome = env.HOME?.trim() || env.USERPROFILE?.trim();
  return envHome || os.homedir();
};

export const decodeShellEscapes = (value: string): string => {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const next = value[index + 1];
    if (next === undefined) {
      decoded += "\\";
      continue;
    }

    if (next === " " || next === "\t" || next === '"' || next === "'" || next === "\\") {
      decoded += next;
      index += 1;
      continue;
    }

    // Preserve backslashes in Windows paths like C:\Users\robot.
    decoded += "\\";
  }

  return decoded;
};

export const stripMatchingQuotes = (value: string): string => {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

export const normalizeShellInput = (rawValue: string): string =>
  decodeShellEscapes(stripMatchingQuotes(rawValue.trim()));

export const expandHomePath = (
  value: string,
  env: NodeJS.ProcessEnv = process.env
): string => {
  if (!value.startsWith("~")) {
    return value;
  }

  const home = getHomeDirectory(env);
  if (!home) {
    return value;
  }

  if (value === "~") {
    return home;
  }

  return path.join(home, value.slice(1));
};

export const normalizeFilesystemInput = (
  rawValue: string,
  env: NodeJS.ProcessEnv = process.env
): string => expandHomePath(normalizeShellInput(rawValue), env);

export const isWindowsAbsolutePath = (value: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");

import { spawnSync, type SpawnSyncReturns } from "node:child_process";

const GITHUB_CLI_TIMEOUT_MS = 2_000;

let cachedGitHubCliToken: string | null | undefined;

type SpawnSyncImpl = typeof spawnSync;
type SpawnSyncResult = SpawnSyncReturns<string>;

const normalizeToken = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const readGitHubCliCommand = (
  args: string[],
  spawnSyncImpl: SpawnSyncImpl = spawnSync
): string | undefined => {
  const result: SpawnSyncResult = spawnSyncImpl("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: GITHUB_CLI_TIMEOUT_MS,
  });

  if (result.error || result.status !== 0) {
    return undefined;
  }

  return normalizeToken(`${result.stdout || ""}${result.stderr || ""}`) || undefined;
};

export const extractGitHubCliToken = (output: string | undefined): string | undefined => {
  const normalized = normalizeToken(output);
  if (!normalized) return undefined;

  const tokenLine = normalized.match(/Token:\s*(\S+)/i);
  if (tokenLine?.[1]) {
    return tokenLine[1];
  }

  if (!normalized.includes("\n") && !normalized.includes("\r") && !normalized.toLowerCase().includes("logged in")) {
    return normalized;
  }

  return undefined;
};

export const readGitHubCliToken = (
  spawnSyncImpl: SpawnSyncImpl = spawnSync
): string | undefined => {
  if (cachedGitHubCliToken !== undefined) {
    return cachedGitHubCliToken || undefined;
  }

  const directToken = extractGitHubCliToken(readGitHubCliCommand(["auth", "token"], spawnSyncImpl));
  if (directToken) {
    cachedGitHubCliToken = directToken;
    return directToken;
  }

  // Older gh builds print `auth status --show-token` output to stderr.
  const statusToken = extractGitHubCliToken(
    readGitHubCliCommand(["auth", "status", "--show-token"], spawnSyncImpl)
  );
  cachedGitHubCliToken = statusToken || null;
  return cachedGitHubCliToken || undefined;
};

export const resolveGitHubAccessToken = (
  explicitToken: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  spawnSyncImpl: SpawnSyncImpl = spawnSync
): string | undefined => explicitToken || env.GITHUB_TOKEN || env.GH_TOKEN || readGitHubCliToken(spawnSyncImpl);

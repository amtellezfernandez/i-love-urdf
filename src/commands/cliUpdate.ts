import * as https from "node:https";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CliArgMap } from "./commandHelpers";

const FALLBACK_INSTALL_SPEC = "git+https://github.com/amtellezfernandez/i-love-urdf.git";
const UPDATE_CHECK_TIMEOUT_MS = 1_500;
const UPDATE_CHECK_CACHE_TTL_MS = 12 * 60 * 60 * 1_000;
const UPDATE_CHECK_DIR = path.join(os.homedir(), ".i-love-urdf");
const UPDATE_CHECK_CACHE_PATH = path.join(UPDATE_CHECK_DIR, "update-check.json");

type InstalledPackageMetadata = {
  version: string;
  repositoryUrl: string;
  installSpec: string;
};

type UpdateCheckCache = {
  checkedAt: number;
  currentVersion: string;
  latestVersion: string | null;
  repositoryUrl: string;
};

export type UpdateAvailability = {
  currentVersion: string;
  latestVersion: string;
  installSpec: string;
};

type UpdateCheckOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  useCache?: boolean;
};

let cachedUpdateAvailabilityPromise: Promise<UpdateAvailability | null> | null = null;

const parsePackageJson = (): {
  version?: unknown;
  repository?: { url?: unknown } | unknown;
} => {
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown;
    repository?: { url?: unknown } | unknown;
  };
};

const resolveInstallSpec = (): string => {
  try {
    const parsed = parsePackageJson();
    const repository =
      typeof parsed.repository === "object" && parsed.repository !== null ? parsed.repository : undefined;
    const repositoryUrl =
      repository && "url" in repository && typeof repository.url === "string"
        ? repository.url
        : undefined;
    if (!repositoryUrl) {
      return FALLBACK_INSTALL_SPEC;
    }

    return repositoryUrl.startsWith("git+") ? repositoryUrl : `git+${repositoryUrl}`;
  } catch {
    return FALLBACK_INSTALL_SPEC;
  }
};

const readInstalledPackageMetadata = (): InstalledPackageMetadata => {
  const parsed = parsePackageJson();
  const repository =
    typeof parsed.repository === "object" && parsed.repository !== null ? parsed.repository : undefined;
  const repositoryUrl =
    repository && "url" in repository && typeof repository.url === "string"
      ? repository.url
      : FALLBACK_INSTALL_SPEC.replace(/^git\+/, "");
  const version = typeof parsed.version === "string" ? parsed.version : "0.0.0";
  return {
    version,
    repositoryUrl,
    installSpec: resolveInstallSpec(),
  };
};

const buildUpdateCommand = (installSpec: string): readonly string[] => [
  "npm",
  "install",
  "-g",
  "--install-links=true",
  installSpec,
];

const compareVersions = (left: string, right: string): number => {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split("-", 1)[0]
      .split(".")
      .map((segment) => Number.parseInt(segment, 10))
      .map((segment) => (Number.isFinite(segment) ? segment : 0));

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const width = Math.max(leftParts.length, rightParts.length, 3);

  for (let index = 0; index < width; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
};

const parseGitHubRepository = (repositoryUrl: string): { owner: string; repo: string } | null => {
  const normalized = repositoryUrl.trim().replace(/^git\+/, "").replace(/\.git$/i, "");
  const match = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/i);
  if (!match?.groups?.owner || !match.groups.repo) {
    return null;
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
  };
};

const readUpdateCache = (
  metadata: InstalledPackageMetadata,
  env: NodeJS.ProcessEnv
): UpdateAvailability | null | undefined => {
  if (env.ILU_DISABLE_UPDATE_CHECK_CACHE === "1") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(UPDATE_CHECK_CACHE_PATH, "utf8")) as UpdateCheckCache;
    const isFresh = Date.now() - parsed.checkedAt <= UPDATE_CHECK_CACHE_TTL_MS;
    if (
      !isFresh ||
      parsed.currentVersion !== metadata.version ||
      parsed.repositoryUrl !== metadata.repositoryUrl
    ) {
      return undefined;
    }

    if (!parsed.latestVersion || compareVersions(parsed.latestVersion, metadata.version) <= 0) {
      return null;
    }

    return {
      currentVersion: metadata.version,
      latestVersion: parsed.latestVersion,
      installSpec: metadata.installSpec,
    };
  } catch {
    return undefined;
  }
};

const writeUpdateCache = (
  metadata: InstalledPackageMetadata,
  latestVersion: string | null,
  env: NodeJS.ProcessEnv
) => {
  if (env.ILU_DISABLE_UPDATE_CHECK_CACHE === "1") {
    return;
  }

  try {
    fs.mkdirSync(UPDATE_CHECK_DIR, { recursive: true });
    fs.writeFileSync(
      UPDATE_CHECK_CACHE_PATH,
      JSON.stringify(
        {
          checkedAt: Date.now(),
          currentVersion: metadata.version,
          latestVersion,
          repositoryUrl: metadata.repositoryUrl,
        } satisfies UpdateCheckCache,
        null,
        2
      ) + "\n",
      "utf8"
    );
  } catch {
    // Never fail shell startup because an update-check cache write failed.
  }
};

const requestJson = (url: string, timeoutMs: number): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "ilu-update-check",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`update check failed with status ${statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("update check timed out"));
    });
    request.on("error", reject);
  });

const fetchLatestVersionFromGitHub = async (
  metadata: InstalledPackageMetadata,
  timeoutMs: number
): Promise<string | null> => {
  const repository = parseGitHubRepository(metadata.repositoryUrl);
  if (!repository) {
    return null;
  }

  const response = (await requestJson(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/package.json`,
    timeoutMs
  )) as { content?: unknown; encoding?: unknown };

  if (typeof response.content !== "string" || response.encoding !== "base64") {
    return null;
  }

  const decoded = Buffer.from(response.content.replace(/\n/g, ""), "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version.trim() : null;
};

export const checkForUpdateAvailability = async (
  options: UpdateCheckOptions = {}
): Promise<UpdateAvailability | null> => {
  const env = options.env ?? process.env;
  const metadata = readInstalledPackageMetadata();
  const forcedLatestVersion = env.ILU_UPDATE_LATEST_VERSION?.trim();

  if (forcedLatestVersion) {
    return compareVersions(forcedLatestVersion, metadata.version) > 0
      ? {
          currentVersion: metadata.version,
          latestVersion: forcedLatestVersion,
          installSpec: metadata.installSpec,
        }
      : null;
  }

  if (env.ILU_DISABLE_UPDATE_CHECK === "1") {
    return null;
  }

  const useCache = options.useCache !== false;
  if (useCache) {
    const cached = readUpdateCache(metadata, env);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (!options.env && useCache && cachedUpdateAvailabilityPromise) {
    return cachedUpdateAvailabilityPromise;
  }

  const checkPromise = (async () => {
    try {
      const latestVersion = await fetchLatestVersionFromGitHub(
        metadata,
        options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS
      );
      if (useCache) {
        writeUpdateCache(metadata, latestVersion, env);
      }

      if (!latestVersion || compareVersions(latestVersion, metadata.version) <= 0) {
        return null;
      }

      return {
        currentVersion: metadata.version,
        latestVersion,
        installSpec: metadata.installSpec,
      };
    } catch {
      return null;
    }
  })();

  if (!options.env && useCache) {
    cachedUpdateAvailabilityPromise = checkPromise;
  }

  return checkPromise;
};

export const renderUpdateHelp = (): string => {
  return [
    "Update ilu to the latest version from GitHub.",
    "",
    "Usage",
    "  ilu update",
    "  ilu update --dry-run",
    "",
    "Notes",
    "  The interactive shell also checks for newer releases and can prompt you to update.",
    "  This command reinstalls the latest CLI from the configured GitHub repository.",
  ].join("\n");
};

export const runUpdateCommand = (args: CliArgMap = new Map()) => {
  const installSpec = readInstalledPackageMetadata().installSpec;
  const command = buildUpdateCommand(installSpec);
  const dryRun = args.has("dry-run") || process.env.ILU_UPDATE_DRY_RUN === "1";

  if (dryRun) {
    console.log(command.join(" "));
    return;
  }

  console.log("Updating ilu...");
  console.log(command.join(" "));

  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`ilu update failed with status ${result.status ?? 1}`);
  }

  console.log("ilu is up to date.");
};

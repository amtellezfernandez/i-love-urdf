import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CliArgMap } from "./commandHelpers";

const FALLBACK_INSTALL_SPEC = "git+https://github.com/amtellezfernandez/i-love-urdf.git";

const resolveInstallSpec = (): string => {
  try {
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      repository?: { url?: unknown } | unknown;
    };
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

const buildUpdateCommand = (installSpec: string): readonly string[] => [
  "npm",
  "install",
  "-g",
  "--install-links=true",
  installSpec,
];

export const renderUpdateHelp = (): string => {
  return [
    "Update ilu to the latest version from GitHub.",
    "",
    "Usage",
    "  ilu update",
    "  ilu update --dry-run",
    "",
    "Notes",
    "  This reinstalls the latest CLI from the configured GitHub repository.",
  ].join("\n");
};

export const runUpdateCommand = (args: CliArgMap = new Map()) => {
  const installSpec = resolveInstallSpec();
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

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { readGitHubCliToken } from "../node/githubCliAuth";
import { probeXacroRuntime } from "../xacro/xacroNode";
import type { CliArgMap } from "./commandHelpers";

const SUPPORTED_NODE_MAJORS = [20, 22, 24] as const;

type DoctorPlatformTier = "release-gated" | "ci-gated" | "unsupported";

export type DoctorReport = {
  generatedAt: string;
  ilu: {
    name: string;
    version: string;
    cliPath: string;
    repositoryUrl: string;
    installSpec: string;
  };
  runtime: {
    nodeVersion: string;
    nodeMajor: number;
    platform: NodeJS.Platform;
    arch: string;
    cwd: string;
    shell: string | null;
    stdinTty: boolean;
    stdoutTty: boolean;
  };
  support: {
    nodeSupported: boolean;
    platformSupported: boolean;
    platformTier: DoctorPlatformTier;
    notes: string[];
  };
  github: {
    envTokenConfigured: boolean;
    ghCliAvailable: boolean;
    ghCliAuthenticated: boolean;
    authenticated: boolean;
  };
  xacro: {
    available: boolean;
    runtime?: string;
    pythonExecutable: string;
    packageVersions: Record<string, string>;
    error?: string;
  };
};

type PackageMetadata = {
  name: string;
  version: string;
  repositoryUrl: string;
  installSpec: string;
};

const readPackageMetadata = (): PackageMetadata => {
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    name?: unknown;
    version?: unknown;
    repository?: { url?: unknown } | unknown;
  };
  const repository =
    typeof parsed.repository === "object" && parsed.repository !== null ? parsed.repository : undefined;
  const repositoryUrl =
    repository && "url" in repository && typeof repository.url === "string"
      ? repository.url
      : "https://github.com/amtellezfernandez/i-love-urdf.git";

  return {
    name: typeof parsed.name === "string" ? parsed.name : "i-love-urdf",
    version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
    repositoryUrl,
    installSpec: `${typeof parsed.name === "string" ? parsed.name : "i-love-urdf"}@${typeof parsed.version === "string" ? parsed.version : "0.0.0"}`,
  };
};

const getPlatformTier = (platform: NodeJS.Platform): DoctorPlatformTier => {
  switch (platform) {
    case "linux":
      return "release-gated";
    case "darwin":
    case "win32":
      return "ci-gated";
    default:
      return "unsupported";
  }
};

const isCommandAvailable = (command: string): boolean => {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 2_000,
  });
  return !result.error && result.status === 0;
};

const formatYesNo = (value: boolean): string => (value ? "yes" : "no");

const buildSupportNotes = (
  nodeSupported: boolean,
  platformTier: DoctorPlatformTier,
  githubAuthenticated: boolean,
  xacroAvailable: boolean
): string[] => {
  const notes: string[] = [];

  if (!nodeSupported) {
    notes.push(`Node ${process.versions.node} is outside the tested majors (${SUPPORTED_NODE_MAJORS.join(", ")}).`);
  }

  if (platformTier === "unsupported") {
    notes.push(`Platform ${process.platform} is outside the CI-gated support matrix.`);
  } else if (platformTier === "ci-gated") {
    notes.push(`${process.platform} is CI-gated, but Linux carries the release-grade runtime and performance gate.`);
  }

  if (!githubAuthenticated) {
    notes.push("GitHub auth is not configured. Public repos still work; private repos need gh auth login or GITHUB_TOKEN.");
  }

  if (!xacroAvailable) {
    notes.push("XACRO runtime is not ready. Run `ilu setup-xacro-runtime` or `!xacro` inside the shell.");
  }

  return notes;
};

export const collectDoctorReport = async (): Promise<DoctorReport> => {
  const metadata = readPackageMetadata();
  const nodeMajor = Number.parseInt(process.versions.node.split(".", 1)[0] || "0", 10);
  const nodeSupported = SUPPORTED_NODE_MAJORS.includes(nodeMajor as (typeof SUPPORTED_NODE_MAJORS)[number]);
  const platformTier = getPlatformTier(process.platform);
  const platformSupported = platformTier !== "unsupported";
  const envTokenConfigured = Boolean(process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim());
  const ghCliAvailable = isCommandAvailable("gh");
  const ghCliAuthenticated = Boolean(readGitHubCliToken());
  const authenticated = envTokenConfigured || ghCliAuthenticated;
  const xacro = await probeXacroRuntime({});
  const notes = buildSupportNotes(nodeSupported, platformTier, authenticated, xacro.available);

  return {
    generatedAt: new Date().toISOString(),
    ilu: {
      name: metadata.name,
      version: metadata.version,
      cliPath: path.resolve(__dirname, "..", "cli.js"),
      repositoryUrl: metadata.repositoryUrl,
      installSpec: metadata.installSpec,
    },
    runtime: {
      nodeVersion: process.versions.node,
      nodeMajor,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      shell: process.env.SHELL?.trim() || process.env.ComSpec?.trim() || null,
      stdinTty: Boolean(process.stdin.isTTY),
      stdoutTty: Boolean(process.stdout.isTTY),
    },
    support: {
      nodeSupported,
      platformSupported,
      platformTier,
      notes,
    },
    github: {
      envTokenConfigured,
      ghCliAvailable,
      ghCliAuthenticated,
      authenticated,
    },
    xacro: {
      available: xacro.available,
      runtime: xacro.runtime,
      pythonExecutable: xacro.pythonExecutable,
      packageVersions: xacro.packageVersions,
      error: xacro.error,
    },
  };
};

export const renderDoctorHelp = (): string =>
  [
    "Inspect the current ilu runtime, support tier, auth, and xacro setup.",
    "",
    "Usage",
    "  ilu doctor",
    "  ilu doctor --json",
    "",
    "What it reports",
    "  ilu version, install source, and CLI path",
    "  node version, platform, architecture, and TTY state",
    "  whether this machine is on a release-gated or CI-gated support tier",
    "  GitHub auth availability from env vars or gh auth",
    "  local xacro runtime availability and installed package versions",
  ].join("\n");

export const renderDoctorReport = (report: DoctorReport): string => {
  const lines = [
    "ILU Doctor",
    "",
    "ILU",
    `  version ${report.ilu.version}`,
    `  cli ${report.ilu.cliPath}`,
    `  install ${report.ilu.installSpec}`,
    "",
    "Runtime",
    `  node ${report.runtime.nodeVersion} (${report.support.nodeSupported ? "supported" : "outside tested majors"})`,
    `  platform ${report.runtime.platform} ${report.runtime.arch} (${report.support.platformTier})`,
    `  cwd ${report.runtime.cwd}`,
    `  shell ${report.runtime.shell ?? "unknown"}`,
    `  tty stdin=${formatYesNo(report.runtime.stdinTty)} stdout=${formatYesNo(report.runtime.stdoutTty)}`,
    "",
    "GitHub",
    `  authenticated ${formatYesNo(report.github.authenticated)}`,
    `  env token ${formatYesNo(report.github.envTokenConfigured)}`,
    `  gh cli ${formatYesNo(report.github.ghCliAvailable)}`,
    `  gh auth ${formatYesNo(report.github.ghCliAuthenticated)}`,
    "",
    "XACRO",
    `  available ${formatYesNo(report.xacro.available)}`,
    `  runtime ${report.xacro.runtime ?? "none"}`,
    `  python ${report.xacro.pythonExecutable}`,
  ];

  const runtimePackages = Object.entries(report.xacro.packageVersions);
  if (runtimePackages.length > 0) {
    lines.push(`  packages ${runtimePackages.map(([name, version]) => `${name}=${version}`).join(", ")}`);
  }

  if (report.xacro.error) {
    lines.push(`  note ${report.xacro.error}`);
  }

  if (report.support.notes.length > 0) {
    lines.push("", "Notes");
    for (const note of report.support.notes) {
      lines.push(`  - ${note}`);
    }
  }

  lines.push("", "Use `ilu doctor --json` for machine-readable diagnostics.");
  return lines.join("\n");
};

export const runDoctorCommand = async (args: CliArgMap): Promise<void> => {
  const report = await collectDoctorReport();
  if (args.has("json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(renderDoctorReport(report));
};

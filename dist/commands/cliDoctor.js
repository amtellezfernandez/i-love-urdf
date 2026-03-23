"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoctorCommand = exports.renderDoctorReport = exports.renderDoctorHelp = exports.collectDoctorReport = void 0;
const node_child_process_1 = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const githubCliAuth_1 = require("../node/githubCliAuth");
const xacroNode_1 = require("../xacro/xacroNode");
const SUPPORTED_NODE_MAJORS = [20, 22, 24];
const readPackageMetadata = () => {
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const repository = typeof parsed.repository === "object" && parsed.repository !== null ? parsed.repository : undefined;
    const repositoryUrl = repository && "url" in repository && typeof repository.url === "string"
        ? repository.url
        : "https://github.com/amtellezfernandez/i-love-urdf.git";
    return {
        name: typeof parsed.name === "string" ? parsed.name : "i-love-urdf",
        version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
        repositoryUrl,
        installSpec: `${typeof parsed.name === "string" ? parsed.name : "i-love-urdf"}@${typeof parsed.version === "string" ? parsed.version : "0.0.0"}`,
    };
};
const getPlatformTier = (platform) => {
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
const isCommandAvailable = (command) => {
    const result = (0, node_child_process_1.spawnSync)(command, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 2000,
    });
    return !result.error && result.status === 0;
};
const formatYesNo = (value) => (value ? "yes" : "no");
const buildSupportNotes = (nodeSupported, platformTier, githubAuthenticated, xacroAvailable) => {
    const notes = [];
    if (!nodeSupported) {
        notes.push(`Node ${process.versions.node} is outside the tested majors (${SUPPORTED_NODE_MAJORS.join(", ")}).`);
    }
    if (platformTier === "unsupported") {
        notes.push(`Platform ${process.platform} is outside the CI-gated support matrix.`);
    }
    else if (platformTier === "ci-gated") {
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
const collectDoctorReport = async () => {
    const metadata = readPackageMetadata();
    const nodeMajor = Number.parseInt(process.versions.node.split(".", 1)[0] || "0", 10);
    const nodeSupported = SUPPORTED_NODE_MAJORS.includes(nodeMajor);
    const platformTier = getPlatformTier(process.platform);
    const platformSupported = platformTier !== "unsupported";
    const envTokenConfigured = Boolean(process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim());
    const ghCliAvailable = isCommandAvailable("gh");
    const ghCliAuthenticated = Boolean((0, githubCliAuth_1.readGitHubCliToken)());
    const authenticated = envTokenConfigured || ghCliAuthenticated;
    const xacro = await (0, xacroNode_1.probeXacroRuntime)({});
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
exports.collectDoctorReport = collectDoctorReport;
const renderDoctorHelp = () => [
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
exports.renderDoctorHelp = renderDoctorHelp;
const renderDoctorReport = (report) => {
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
exports.renderDoctorReport = renderDoctorReport;
const runDoctorCommand = async (args) => {
    const report = await (0, exports.collectDoctorReport)();
    if (args.has("json")) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log((0, exports.renderDoctorReport)(report));
};
exports.runDoctorCommand = runDoctorCommand;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUpdateCommand = exports.renderUpdateHelp = void 0;
const node_child_process_1 = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const FALLBACK_INSTALL_SPEC = "git+https://github.com/amtellezfernandez/i-love-urdf.git";
const resolveInstallSpec = () => {
    try {
        const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
        const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        const repository = typeof parsed.repository === "object" && parsed.repository !== null ? parsed.repository : undefined;
        const repositoryUrl = repository && "url" in repository && typeof repository.url === "string"
            ? repository.url
            : undefined;
        if (!repositoryUrl) {
            return FALLBACK_INSTALL_SPEC;
        }
        return repositoryUrl.startsWith("git+") ? repositoryUrl : `git+${repositoryUrl}`;
    }
    catch {
        return FALLBACK_INSTALL_SPEC;
    }
};
const buildUpdateCommand = (installSpec) => [
    "npm",
    "install",
    "-g",
    "--install-links=true",
    installSpec,
];
const renderUpdateHelp = () => {
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
exports.renderUpdateHelp = renderUpdateHelp;
const runUpdateCommand = (args = new Map()) => {
    const installSpec = resolveInstallSpec();
    const command = buildUpdateCommand(installSpec);
    const dryRun = args.has("dry-run") || process.env.ILU_UPDATE_DRY_RUN === "1";
    if (dryRun) {
        console.log(command.join(" "));
        return;
    }
    console.log("Updating ilu...");
    console.log(command.join(" "));
    const result = (0, node_child_process_1.spawnSync)(command[0], command.slice(1), {
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
exports.runUpdateCommand = runUpdateCommand;

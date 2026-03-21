"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGitHubAccessToken = exports.readGitHubCliToken = exports.extractGitHubCliToken = void 0;
const node_child_process_1 = require("node:child_process");
const GITHUB_CLI_TIMEOUT_MS = 2000;
let cachedGitHubCliToken;
const normalizeToken = (value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};
const readGitHubCliCommand = (args, spawnSyncImpl = node_child_process_1.spawnSync) => {
    const result = spawnSyncImpl("gh", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: GITHUB_CLI_TIMEOUT_MS,
    });
    if (result.error || result.status !== 0) {
        return undefined;
    }
    return normalizeToken(`${result.stdout || ""}${result.stderr || ""}`) || undefined;
};
const extractGitHubCliToken = (output) => {
    const normalized = normalizeToken(output);
    if (!normalized)
        return undefined;
    const tokenLine = normalized.match(/Token:\s*(\S+)/i);
    if (tokenLine?.[1]) {
        return tokenLine[1];
    }
    if (!normalized.includes("\n") && !normalized.includes("\r") && !normalized.toLowerCase().includes("logged in")) {
        return normalized;
    }
    return undefined;
};
exports.extractGitHubCliToken = extractGitHubCliToken;
const readGitHubCliToken = (spawnSyncImpl = node_child_process_1.spawnSync) => {
    if (cachedGitHubCliToken !== undefined) {
        return cachedGitHubCliToken || undefined;
    }
    const directToken = (0, exports.extractGitHubCliToken)(readGitHubCliCommand(["auth", "token"], spawnSyncImpl));
    if (directToken) {
        cachedGitHubCliToken = directToken;
        return directToken;
    }
    // Older gh builds print `auth status --show-token` output to stderr.
    const statusToken = (0, exports.extractGitHubCliToken)(readGitHubCliCommand(["auth", "status", "--show-token"], spawnSyncImpl));
    cachedGitHubCliToken = statusToken || null;
    return cachedGitHubCliToken || undefined;
};
exports.readGitHubCliToken = readGitHubCliToken;
const resolveGitHubAccessToken = (explicitToken, env = process.env, spawnSyncImpl = node_child_process_1.spawnSync) => explicitToken || env.GITHUB_TOKEN || env.GH_TOKEN || (0, exports.readGitHubCliToken)(spawnSyncImpl);
exports.resolveGitHubAccessToken = resolveGitHubAccessToken;

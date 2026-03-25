"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIluSharedSessionGitHubSource = exports.coerceIluSharedSessionSnapshot = exports.coerceIluSharedLoadedSource = exports.isIluSharedLoadedSourceKind = exports.ILU_SHARED_SESSION_SOURCE_KINDS = exports.ILU_SHARED_SESSION_SCHEMA_VERSION = exports.ILU_SHARED_SESSION_SCHEMA = void 0;
const ILU_SHARED_SESSION_GITHUB_REF_PATTERN = /^[^/\s]+\/[^/\s]+$/;
const ILU_SHARED_SESSION_GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const ILU_SHARED_SESSION_GITHUB_OWNER_INDEX = 0;
const ILU_SHARED_SESSION_GITHUB_REPO_INDEX = 1;
const ILU_SHARED_SESSION_GITHUB_MIN_PATH_PARTS = 2;
exports.ILU_SHARED_SESSION_SCHEMA = "ilu-shared-session";
exports.ILU_SHARED_SESSION_SCHEMA_VERSION = 1;
exports.ILU_SHARED_SESSION_SOURCE_KINDS = ["local-file", "local-repo", "github"];
const isRecord = (value) => typeof value === "object" && value !== null;
const isIluSharedLoadedSourceKind = (value) => typeof value === "string" &&
    exports.ILU_SHARED_SESSION_SOURCE_KINDS.includes(value);
exports.isIluSharedLoadedSourceKind = isIluSharedLoadedSourceKind;
const coerceIluSharedLoadedSource = (raw, fallbackUrdfPath) => {
    if (!isRecord(raw) || !(0, exports.isIluSharedLoadedSourceKind)(raw.source)) {
        return null;
    }
    return {
        source: raw.source,
        urdfPath: typeof raw.urdfPath === "string" ? raw.urdfPath : fallbackUrdfPath,
        localPath: typeof raw.localPath === "string" ? raw.localPath : undefined,
        githubRef: typeof raw.githubRef === "string" ? raw.githubRef : undefined,
        githubRevision: typeof raw.githubRevision === "string" ? raw.githubRevision : undefined,
        repositoryUrdfPath: typeof raw.repositoryUrdfPath === "string" ? raw.repositoryUrdfPath : undefined,
        meshReferenceCorrectionCount: typeof raw.meshReferenceCorrectionCount === "number" ? raw.meshReferenceCorrectionCount : undefined,
        meshReferenceUnresolvedCount: typeof raw.meshReferenceUnresolvedCount === "number" ? raw.meshReferenceUnresolvedCount : undefined,
    };
};
exports.coerceIluSharedLoadedSource = coerceIluSharedLoadedSource;
const coerceIluSharedSessionSnapshot = (raw) => {
    if (!isRecord(raw)) {
        return null;
    }
    if (raw.schema !== exports.ILU_SHARED_SESSION_SCHEMA ||
        raw.schemaVersion !== exports.ILU_SHARED_SESSION_SCHEMA_VERSION ||
        typeof raw.sessionId !== "string" ||
        typeof raw.workingUrdfPath !== "string" ||
        typeof raw.lastUrdfPath !== "string") {
        return null;
    }
    const fallbackTimestamp = new Date().toISOString();
    return {
        schema: exports.ILU_SHARED_SESSION_SCHEMA,
        schemaVersion: exports.ILU_SHARED_SESSION_SCHEMA_VERSION,
        sessionId: raw.sessionId,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallbackTimestamp,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallbackTimestamp,
        workingUrdfPath: raw.workingUrdfPath,
        lastUrdfPath: raw.lastUrdfPath,
        loadedSource: (0, exports.coerceIluSharedLoadedSource)(raw.loadedSource, raw.workingUrdfPath),
    };
};
exports.coerceIluSharedSessionSnapshot = coerceIluSharedSessionSnapshot;
const createIluSharedSessionGitHubSource = (owner, repo, ref) => ({
    owner,
    repo,
    ref,
    repositoryUrl: `https://github.com/${owner}/${repo}`,
});
const getIluSharedSessionGitHubSource = (loadedSource) => {
    if (loadedSource?.source !== "github" || !loadedSource.githubRef?.trim()) {
        return null;
    }
    const githubRef = loadedSource.githubRef.trim();
    const ref = loadedSource.githubRevision?.trim() || undefined;
    if (ILU_SHARED_SESSION_GITHUB_REF_PATTERN.test(githubRef)) {
        const [owner, repo] = githubRef.split("/", ILU_SHARED_SESSION_GITHUB_MIN_PATH_PARTS);
        return createIluSharedSessionGitHubSource(owner, repo, ref);
    }
    let parsed;
    try {
        parsed = new URL(githubRef);
    }
    catch {
        return null;
    }
    if (!ILU_SHARED_SESSION_GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) {
        return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < ILU_SHARED_SESSION_GITHUB_MIN_PATH_PARTS) {
        return null;
    }
    const owner = parts[ILU_SHARED_SESSION_GITHUB_OWNER_INDEX];
    const repo = parts[ILU_SHARED_SESSION_GITHUB_REPO_INDEX]?.replace(/\.git$/i, "");
    if (!owner || !repo) {
        return null;
    }
    return createIluSharedSessionGitHubSource(owner, repo, ref);
};
exports.getIluSharedSessionGitHubSource = getIluSharedSessionGitHubSource;

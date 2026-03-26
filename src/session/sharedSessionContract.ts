const ILU_SHARED_SESSION_GITHUB_REF_PATTERN = /^[^/\s]+\/[^/\s]+$/;
const ILU_SHARED_SESSION_GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const ILU_SHARED_SESSION_GITHUB_OWNER_INDEX = 0;
const ILU_SHARED_SESSION_GITHUB_REPO_INDEX = 1;
const ILU_SHARED_SESSION_GITHUB_MIN_PATH_PARTS = 2;

export const ILU_SHARED_SESSION_SCHEMA = "ilu-shared-session" as const;
export const ILU_SHARED_SESSION_SCHEMA_VERSION = 1 as const;
export const ILU_SHARED_SESSION_SOURCE_KINDS = ["local-file", "local-repo", "github"] as const;

export type IluSharedLoadedSourceKind = (typeof ILU_SHARED_SESSION_SOURCE_KINDS)[number];

export type IluSharedLoadedSource = {
  source: IluSharedLoadedSourceKind;
  urdfPath: string;
  localPath?: string;
  extractedArchivePath?: string;
  githubRef?: string;
  githubRevision?: string;
  repositoryUrdfPath?: string;
  meshReferenceCorrectionCount?: number;
  meshReferenceUnresolvedCount?: number;
};

export type IluSharedSessionGitHubSource = {
  owner: string;
  repo: string;
  ref?: string;
  repositoryUrl: string;
};

export type IluSharedSessionSnapshot = {
  schema: typeof ILU_SHARED_SESSION_SCHEMA;
  schemaVersion: typeof ILU_SHARED_SESSION_SCHEMA_VERSION;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  workingUrdfPath: string;
  lastUrdfPath: string;
  loadedSource: IluSharedLoadedSource | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isIluSharedLoadedSourceKind = (value: unknown): value is IluSharedLoadedSourceKind =>
  typeof value === "string" &&
  ILU_SHARED_SESSION_SOURCE_KINDS.includes(value as IluSharedLoadedSourceKind);

export const coerceIluSharedLoadedSource = (
  raw: unknown,
  fallbackUrdfPath: string
): IluSharedLoadedSource | null => {
  if (!isRecord(raw) || !isIluSharedLoadedSourceKind(raw.source)) {
    return null;
  }

  return {
    source: raw.source,
    urdfPath: typeof raw.urdfPath === "string" ? raw.urdfPath : fallbackUrdfPath,
    localPath: typeof raw.localPath === "string" ? raw.localPath : undefined,
    extractedArchivePath: typeof raw.extractedArchivePath === "string" ? raw.extractedArchivePath : undefined,
    githubRef: typeof raw.githubRef === "string" ? raw.githubRef : undefined,
    githubRevision: typeof raw.githubRevision === "string" ? raw.githubRevision : undefined,
    repositoryUrdfPath:
      typeof raw.repositoryUrdfPath === "string" ? raw.repositoryUrdfPath : undefined,
    meshReferenceCorrectionCount:
      typeof raw.meshReferenceCorrectionCount === "number" ? raw.meshReferenceCorrectionCount : undefined,
    meshReferenceUnresolvedCount:
      typeof raw.meshReferenceUnresolvedCount === "number" ? raw.meshReferenceUnresolvedCount : undefined,
  };
};

export const coerceIluSharedSessionSnapshot = (
  raw: unknown
): IluSharedSessionSnapshot | null => {
  if (!isRecord(raw)) {
    return null;
  }

  if (
    raw.schema !== ILU_SHARED_SESSION_SCHEMA ||
    raw.schemaVersion !== ILU_SHARED_SESSION_SCHEMA_VERSION ||
    typeof raw.sessionId !== "string" ||
    typeof raw.workingUrdfPath !== "string" ||
    typeof raw.lastUrdfPath !== "string"
  ) {
    return null;
  }

  const fallbackTimestamp = new Date().toISOString();

  return {
    schema: ILU_SHARED_SESSION_SCHEMA,
    schemaVersion: ILU_SHARED_SESSION_SCHEMA_VERSION,
    sessionId: raw.sessionId,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallbackTimestamp,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallbackTimestamp,
    workingUrdfPath: raw.workingUrdfPath,
    lastUrdfPath: raw.lastUrdfPath,
    loadedSource: coerceIluSharedLoadedSource(raw.loadedSource, raw.workingUrdfPath),
  };
};

const createIluSharedSessionGitHubSource = (
  owner: string,
  repo: string,
  ref: string | undefined
): IluSharedSessionGitHubSource => ({
  owner,
  repo,
  ref,
  repositoryUrl: `https://github.com/${owner}/${repo}`,
});

export const getIluSharedSessionGitHubSource = (
  loadedSource: IluSharedLoadedSource | null | undefined
): IluSharedSessionGitHubSource | null => {
  if (loadedSource?.source !== "github" || !loadedSource.githubRef?.trim()) {
    return null;
  }

  const githubRef = loadedSource.githubRef.trim();
  const ref = loadedSource.githubRevision?.trim() || undefined;

  if (ILU_SHARED_SESSION_GITHUB_REF_PATTERN.test(githubRef)) {
    const [owner, repo] = githubRef.split("/", ILU_SHARED_SESSION_GITHUB_MIN_PATH_PARTS);
    return createIluSharedSessionGitHubSource(owner, repo, ref);
  }

  let parsed: URL;
  try {
    parsed = new URL(githubRef);
  } catch {
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

import { normalizeRepositoryPath } from "./repositoryMeshResolution";
import {
  fixMissingMeshReferencesInRepository,
  type FixMissingMeshReferencesOptions,
  type FixMissingMeshReferencesResult,
} from "./fixMissingMeshReferences";
import {
  createEmptyRepositoryRepoMetadata,
  inspectRepositoryFiles,
  type InspectRepositoryFilesOptions,
  type RepositoryCandidateInspection,
  type RepositoryInspectionSummary,
  type RepositoryRepoMetadata,
} from "./repositoryInspection";
import { buildPackageNameByPathFromRepositoryFiles } from "./repositoryPackageNames";
import {
  matchesRepositoryScope,
  resolveRepositoryScopeFromFiles,
  resolveRepositoryScopedPathFromFiles,
} from "./repositoryPathScope";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_ACCEPT_HEADER = "application/vnd.github.v3+json";
const GITHUB_BAD_CREDENTIALS_PATTERN = /bad credentials/i;
const JSDELIVR_DATA_BASE_URL = "https://data.jsdelivr.com/v1";
const JSDELIVR_CDN_BASE_URL = "https://cdn.jsdelivr.net";
const GITHUB_FETCH_TIMEOUT_MS = 20_000;
const PUBLIC_MIRROR_FETCH_TIMEOUT_MS = 20_000;
const GITHUB_NETWORK_ERROR_PATTERN =
  /Failed to fetch|NetworkError|fetch failed|Load failed|ECONNREFUSED|ERR_CONNECTION_REFUSED|ERR_NETWORK/i;

type GitHubTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha?: string;
};

type GitHubDefaultBranchResponse = {
  default_branch?: string;
};

type GitHubRepositoryOwnerResponse = {
  login?: string;
  url?: string;
};

type GitHubRepositoryApiResponse = GitHubDefaultBranchResponse & {
  description?: string;
  homepage?: string;
  topics?: string[];
  license?: {
    spdx_id?: string;
    name?: string;
  } | null;
  owner?: GitHubRepositoryOwnerResponse | null;
};

type GitHubOwnerProfileResponse = {
  name?: string;
  company?: string;
  blog?: string;
  twitter_username?: string;
  email?: string;
};

type GitHubTreeResponse = {
  tree?: GitHubTreeEntry[];
};

type GitHubBlobResponse = {
  content?: string;
  encoding?: string;
};

type JsDelivrFlatFileEntry = {
  name?: string;
  path?: string;
  size?: number;
};

export type GitHubRepositoryReference = {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
};

export type GitHubRepositoryFile = {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
  size?: number;
  sha?: string;
  encoding?: "sha";
  sourceOwner?: string;
  sourceRepo?: string;
  sourcePath?: string;
};

export type GitHubRepositoryCandidateInspection = RepositoryCandidateInspection;

export type GitHubRepositoryInspectionResult = RepositoryInspectionSummary & {
  owner: string;
  repo: string;
  path: string | null;
  ref: string;
  repositoryUrl: string;
};

export type InspectGitHubRepositoryOptions = InspectRepositoryFilesOptions & {
  accessToken?: string;
};

export type RepairGitHubRepositoryOptions = FixMissingMeshReferencesOptions & {
  accessToken?: string;
  urdfPath?: string;
};

export type GitHubRepositoryMeshRepairResult = FixMissingMeshReferencesResult & {
  owner: string;
  repo: string;
  path: string | null;
  ref: string;
  urdfPath: string;
  repositoryUrl: string;
};

const sanitizeRepoSegment = (value: string): string => value.replace(/\.git$/i, "").trim();

const normalizeOptionalText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const humanizeOwnerLabel = (owner: string): string =>
  owner.replace(/[-_]+/g, " ").trim();

const normalizeLicenseName = (payload: GitHubRepositoryApiResponse): string => {
  const spdxId = normalizeOptionalText(payload.license?.spdx_id);
  if (spdxId && spdxId.toUpperCase() !== "NOASSERTION") {
    return spdxId;
  }
  return normalizeOptionalText(payload.license?.name);
};

const normalizeGitHubTopics = (payload: GitHubRepositoryApiResponse): string[] => {
  if (!Array.isArray(payload.topics)) {
    return [];
  }

  const normalized: string[] = [];
  for (const topic of payload.topics) {
    const item = normalizeOptionalText(String(topic).replace(/-/g, " "));
    if (item && !normalized.includes(item)) {
      normalized.push(item);
    }
  }
  return normalized;
};

const normalizeGitHubXHandle = (value: unknown): string => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return "";
  }
  return normalized.startsWith("@") ? normalized : `@${normalized}`;
};

const buildGitHubHeaders = (accessToken?: string): Headers => {
  const headers = new Headers();
  headers.set("Accept", GITHUB_API_ACCEPT_HEADER);
  if (accessToken) {
    headers.set("Authorization", `token ${accessToken}`);
  }
  return headers;
};

const buildJsDelivrFlatUrl = (owner: string, repo: string, ref?: string): string =>
  `${JSDELIVR_DATA_BASE_URL}/package/gh/${owner}/${repo}${ref ? `@${encodeURIComponent(ref)}` : ""}/flat`;

const buildJsDelivrFileUrl = (
  owner: string,
  repo: string,
  filePath: string,
  ref?: string
): string => {
  const encodedPath = normalizeRepositoryPath(filePath)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${JSDELIVR_CDN_BASE_URL}/gh/${owner}/${repo}${ref ? `@${encodeURIComponent(ref)}` : ""}/${encodedPath}`;
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new Error(`request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const isRecoverableGitHubError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return (
    /rate limit/i.test(error.message) ||
    /too many requests/i.test(error.message) ||
    /abuse detection/i.test(error.message) ||
    /secondary rate limit/i.test(error.message) ||
    /temporarily throttled/i.test(error.message) ||
    /token has no access/i.test(error.message) ||
    GITHUB_NETWORK_ERROR_PATTERN.test(error.message)
  );
};

const fetchGitHubResponse = async (
  url: string,
  accessToken?: string
): Promise<{ response: Response; usedAnonymousFallback: boolean }> => {
  const response = await fetchWithTimeout(
    url,
    {
      headers: buildGitHubHeaders(accessToken),
    },
    GITHUB_FETCH_TIMEOUT_MS
  );

  if (!accessToken || response.status !== 401) {
    return { response, usedAnonymousFallback: false };
  }

  const body = await response.clone().text().catch(() => "");
  if (!GITHUB_BAD_CREDENTIALS_PATTERN.test(body)) {
    return { response, usedAnonymousFallback: false };
  }

  const retry = await fetchWithTimeout(
    url,
    {
      headers: buildGitHubHeaders(undefined),
    },
    GITHUB_FETCH_TIMEOUT_MS
  );
  return { response: retry, usedAnonymousFallback: true };
};

const readGitHubJson = async <T>(
  url: string,
  {
    accessToken,
    notFoundMessage,
    contextLabel,
  }: {
    accessToken?: string;
    notFoundMessage: string;
    contextLabel: string;
  }
): Promise<T> => {
  let response: Response;
  let usedAnonymousFallback = false;

  try {
    const result = await fetchGitHubResponse(url, accessToken);
    response = result.response;
    usedAnonymousFallback = result.usedAnonymousFallback;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`GitHub request failed while ${contextLabel}: ${error.message}`);
    }
    throw new Error(`GitHub request failed while ${contextLabel}.`);
  }

  if (response.status === 404) {
    throw new Error(notFoundMessage);
  }

  if (response.status === 401) {
    throw new Error("Invalid GitHub token.");
  }

  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new Error("GitHub API rate limit exceeded. Retry later or provide --token.");
    }
    if (accessToken && !usedAnonymousFallback) {
      throw new Error("GitHub token has no access to this repository.");
    }
    throw new Error("GitHub access denied for this repository.");
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `GitHub request failed while ${contextLabel}: ${response.status} ${response.statusText}${
        details ? ` - ${details.slice(0, 200)}` : ""
      }`
    );
  }

  return (await response.json()) as T;
};

const readPublicMirrorJson = async <T>(
  url: string,
  {
    notFoundMessage,
    contextLabel,
  }: {
    notFoundMessage: string;
    contextLabel: string;
  }
): Promise<T> => {
  let response: Response;

  try {
    response = await fetchWithTimeout(url, {}, PUBLIC_MIRROR_FETCH_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Public mirror request failed while ${contextLabel}: ${error.message}`);
    }
    throw new Error(`Public mirror request failed while ${contextLabel}.`);
  }

  if (response.status === 404) {
    throw new Error(notFoundMessage);
  }

  if (response.status === 403) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Public mirror refused this repository request${
        details ? `: ${details.slice(0, 200)}` : "."
      }`
    );
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Public mirror request failed while ${contextLabel}: ${response.status} ${response.statusText}${
        details ? ` - ${details.slice(0, 200)}` : ""
      }`
    );
  }

  return (await response.json()) as T;
};

const readPublicMirrorBytes = async (
  url: string,
  filePath: string
): Promise<Uint8Array> => {
  let response: Response;

  try {
    response = await fetchWithTimeout(url, {}, PUBLIC_MIRROR_FETCH_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Public mirror request failed while reading ${filePath}: ${error.message}`);
    }
    throw new Error(`Public mirror request failed while reading ${filePath}.`);
  }

  if (response.status === 404) {
    throw new Error(`GitHub file not found: ${filePath}`);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Public mirror request failed while reading ${filePath}: ${response.status} ${response.statusText}${
        details ? ` - ${details.slice(0, 200)}` : ""
      }`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
};

const decodeBase64ToBytes = (base64: string): Uint8Array => {
  const cleaned = base64.replace(/\s/g, "");
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  }
  const binary = globalThis.atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const decodeBase64ToUtf8 = (base64: string): string =>
  new TextDecoder().decode(decodeBase64ToBytes(base64));

export const parseGitHubRepositoryReference = (
  value: string
): GitHubRepositoryReference | null => {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;

  const sshRemoteMatch = /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i.exec(trimmed);
  if (sshRemoteMatch?.groups) {
    return {
      owner: sanitizeRepoSegment(sshRemoteMatch.groups.owner),
      repo: sanitizeRepoSegment(sshRemoteMatch.groups.repo),
    };
  }

  const looksLikeGitHubHostReference =
    /^(?:(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^/@]+@)?(?:www\.)?github\.com\/|(?:www\.)?github\.com\/)/i.test(
      trimmed
    );
  if (!looksLikeGitHubHostReference) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^[^/]+@[^/]+[:/]/.test(trimmed)) {
      return null;
    }

    const parts = trimmed.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const owner = sanitizeRepoSegment(parts[0]);
    const repo = sanitizeRepoSegment(parts[1]);
    if (!owner || !repo || owner.includes(":") || repo.includes(":") || owner.includes("@") || repo.includes("@")) {
      return null;
    }

    return {
      owner,
      repo,
      path: parts.length > 2 ? parts.slice(2).join("/") : undefined,
    };
  }

  try {
    const normalizedUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(normalizedUrl);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const owner = sanitizeRepoSegment(parts[0]);
    const repo = sanitizeRepoSegment(parts[1]);
    let ref: string | undefined;
    let path: string | undefined;

    if ((parts[2] === "tree" || parts[2] === "blob") && parts.length >= 4) {
      ref = decodeURIComponent(parts[3]);
      path = parts.length > 4 ? parts.slice(4).join("/") : undefined;
    } else if (parts.length > 2) {
      path = parts.slice(2).join("/");
    }

    return { owner, repo, ref, path };
  } catch {
    return null;
  }
};

const getDefaultBranch = async (
  owner: string,
  repo: string,
  accessToken?: string
): Promise<string> => {
  const data = await readGitHubJson<GitHubDefaultBranchResponse>(
    `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}`,
    {
      accessToken,
      notFoundMessage: "GitHub repository not found.",
      contextLabel: "reading repository metadata",
    }
  );
  return data.default_branch || "main";
};

const readGitHubApiJsonOrNull = async <T>(url: string, accessToken?: string): Promise<T | null> => {
  try {
    return await readGitHubJson<T>(url, {
      accessToken,
      notFoundMessage: "GitHub repository not found.",
      contextLabel: "reading repository metadata",
    });
  } catch {
    return null;
  }
};

export const fetchGitHubRepositoryMetadata = async (
  reference: GitHubRepositoryReference,
  accessToken?: string
): Promise<RepositoryRepoMetadata> => {
  const ownerLabel = humanizeOwnerLabel(reference.owner);
  const fallbackMetadata = createEmptyRepositoryRepoMetadata();
  fallbackMetadata.org = ownerLabel;
  fallbackMetadata.authorGithub = reference.owner;

  const repoPayload = await readGitHubApiJsonOrNull<GitHubRepositoryApiResponse>(
    `${GITHUB_API_BASE_URL}/repos/${reference.owner}/${reference.repo}`,
    accessToken
  );
  if (!repoPayload) {
    return fallbackMetadata;
  }

  const ownerLogin = normalizeOptionalText(repoPayload.owner?.login) || reference.owner;
  const ownerProfileUrl = normalizeOptionalText(repoPayload.owner?.url);
  const ownerProfile = ownerProfileUrl
    ? await readGitHubApiJsonOrNull<GitHubOwnerProfileResponse>(ownerProfileUrl, accessToken)
    : null;

  return {
    org:
      normalizeOptionalText(ownerProfile?.name) ||
      normalizeOptionalText(ownerProfile?.company) ||
      ownerLabel,
    summary: normalizeOptionalText(repoPayload.description),
    demo: normalizeOptionalText(repoPayload.homepage),
    tags: normalizeGitHubTopics(repoPayload),
    license: normalizeLicenseName(repoPayload),
    authorWebsite:
      normalizeOptionalText(ownerProfile?.blog) ||
      normalizeOptionalText(repoPayload.homepage),
    authorX: normalizeGitHubXHandle(ownerProfile?.twitter_username),
    authorLinkedin: "",
    authorGithub: ownerLogin,
    contact: normalizeOptionalText(ownerProfile?.email),
    extra: "",
    hfDatasets: [],
  };
};

const convertTreeToRepositoryFiles = (
  treeEntries: GitHubTreeEntry[],
  pathPrefix: string = "",
  options: {
    owner?: string;
    repo?: string;
    ref?: string;
  } = {}
): GitHubRepositoryFile[] => {
  const files: GitHubRepositoryFile[] = [];
  const directories = new Set<string>();
  const normalizedPrefix = normalizeRepositoryPath(pathPrefix);

  for (const entry of treeEntries) {
    const entryPath = normalizeRepositoryPath(entry.path);
    const fullPath =
      normalizedPrefix && !entryPath.startsWith(normalizedPrefix)
        ? normalizeRepositoryPath(`${normalizedPrefix}/${entryPath}`)
        : entryPath;

    if (normalizedPrefix && fullPath && !fullPath.startsWith(normalizedPrefix)) {
      continue;
    }

    if (entry.type === "blob") {
      const name = fullPath.split("/").pop() || fullPath;
      files.push({
        name,
        path: fullPath,
        type: "file",
        download_url:
          options.owner && options.repo
            ? buildJsDelivrFileUrl(options.owner, options.repo, fullPath, options.ref)
            : null,
        size: entry.size || 0,
        sha: entry.sha,
        encoding: "sha",
      });
      continue;
    }

    if (entry.type === "tree") {
      directories.add(fullPath);
    }
  }

  directories.forEach((dirPath) => {
    files.push({
      name: dirPath.split("/").pop() || dirPath,
      path: dirPath,
      type: "dir",
      download_url: null,
      size: 0,
    });
  });

  return files;
};

const fetchPublicMirrorRepositoryFiles = async (
  reference: GitHubRepositoryReference,
  ref: string | undefined,
  pathPrefix: string
): Promise<GitHubRepositoryFile[]> => {
  const listing = await readPublicMirrorJson<{ files?: JsDelivrFlatFileEntry[] }>(
    buildJsDelivrFlatUrl(reference.owner, reference.repo, ref),
    {
      notFoundMessage: pathPrefix
        ? "GitHub repository path not found."
        : "GitHub repository not found.",
      contextLabel: "reading repository listing",
    }
  );

  if (!Array.isArray(listing.files)) {
    throw new Error("Public mirror returned an invalid repository listing.");
  }

  const normalizedPrefix = normalizeRepositoryPath(pathPrefix);
  const files: GitHubRepositoryFile[] = [];
  const directories = new Set<string>();

  for (const entry of listing.files) {
    const rawPath = typeof entry.name === "string" ? entry.name : entry.path;
    const repoPath = normalizeRepositoryPath(rawPath || "").replace(/^\/+/, "");
    if (!repoPath) continue;
    if (
      normalizedPrefix &&
      repoPath !== normalizedPrefix &&
      !repoPath.startsWith(`${normalizedPrefix}/`)
    ) {
      continue;
    }

    const parts = repoPath.split("/").filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }

    files.push({
      name: parts[parts.length - 1] || repoPath,
      path: repoPath,
      type: "file",
      download_url: buildJsDelivrFileUrl(reference.owner, reference.repo, repoPath, ref),
      size: Number.isFinite(entry.size) ? entry.size : undefined,
    });
  }

  directories.forEach((dirPath) => {
    if (
      normalizedPrefix &&
      dirPath !== normalizedPrefix &&
      !dirPath.startsWith(`${normalizedPrefix}/`)
    ) {
      return;
    }
    files.push({
      name: dirPath.split("/").pop() || dirPath,
      path: dirPath,
      type: "dir",
      download_url: null,
      size: 0,
    });
  });

  files.sort((left, right) => {
    if (left.path === right.path) {
      if (left.type === right.type) return 0;
      return left.type === "dir" ? -1 : 1;
    }
    return left.path.localeCompare(right.path);
  });

  return files;
};

export const fetchGitHubRepositoryFiles = async (
  reference: GitHubRepositoryReference,
  accessToken?: string
): Promise<{ ref: string; files: GitHubRepositoryFile[] }> => {
  let ref = reference.ref;
  if (!ref) {
    try {
      ref = await getDefaultBranch(reference.owner, reference.repo, accessToken);
    } catch (error) {
      if (!isRecoverableGitHubError(error)) {
        throw error;
      }

      const files = await fetchPublicMirrorRepositoryFiles(reference, undefined, normalizeRepositoryPath(reference.path || ""));
      return {
        ref: "HEAD",
        files,
      };
    }
  }
  const readTree = async () =>
    readGitHubJson<GitHubTreeResponse>(
      `${GITHUB_API_BASE_URL}/repos/${reference.owner}/${reference.repo}/git/trees/${
        ref
      }?recursive=1`,
      {
        accessToken,
        notFoundMessage: "GitHub repository tree not found.",
        contextLabel: "reading repository tree",
      }
    );

  try {
    const tree = await readTree();
    return {
      ref,
      files: convertTreeToRepositoryFiles(tree.tree ?? [], "", {
        owner: reference.owner,
        repo: reference.repo,
        ref,
      }),
    };
  } catch (error) {
    if (isRecoverableGitHubError(error)) {
      return {
        ref,
        files: await fetchPublicMirrorRepositoryFiles(reference, ref, ""),
      };
    }
    throw error;
  }
};

export const fetchGitHubTextFile = async (
  owner: string,
  repo: string,
  filePath: string,
  blobSha?: string,
  accessToken?: string,
  ref?: string,
  downloadUrl?: string | null
): Promise<string> => {
  const bytes = await fetchGitHubFileBytes(
    owner,
    repo,
    filePath,
    blobSha,
    accessToken,
    ref,
    downloadUrl
  );
  return new TextDecoder().decode(bytes);
};

export const fetchGitHubFileBytes = async (
  owner: string,
  repo: string,
  filePath: string,
  blobSha?: string,
  accessToken?: string,
  ref?: string,
  downloadUrl?: string | null
): Promise<Uint8Array> => {
  const publicMirrorUrl = downloadUrl || buildJsDelivrFileUrl(owner, repo, filePath, ref);

  if (!accessToken && publicMirrorUrl) {
    return readPublicMirrorBytes(publicMirrorUrl, filePath);
  }

  const endpoint = blobSha
    ? `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/blobs/${blobSha}`
    : `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${filePath}`;
  let data: GitHubBlobResponse;
  try {
    data = await readGitHubJson<GitHubBlobResponse>(endpoint, {
      accessToken,
      notFoundMessage: `GitHub file not found: ${filePath}`,
      contextLabel: `reading ${filePath}`,
    });
  } catch (error) {
    if (!publicMirrorUrl || !isRecoverableGitHubError(error)) {
      throw error;
    }
    return readPublicMirrorBytes(publicMirrorUrl, filePath);
  }

  if (!data.content || data.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content encoding for ${filePath}.`);
  }

  return decodeBase64ToBytes(data.content);
};

export const inspectGitHubRepositoryUrdfs = async (
  reference: GitHubRepositoryReference,
  options: InspectGitHubRepositoryOptions = {}
): Promise<GitHubRepositoryInspectionResult> => {
  const { ref, files } = await fetchGitHubRepositoryFiles(reference, options.accessToken);
  const scope = resolveRepositoryScopeFromFiles(files, reference.path);
  if (!scope) {
    throw new Error("GitHub repository path not found.");
  }
  const packageNameByPath = await buildPackageNameByPathFromRepositoryFiles(files, (file) =>
    fetchGitHubTextFile(
      reference.owner,
      reference.repo,
      file.path,
      file.sha,
      options.accessToken,
      ref,
      file.download_url
    )
  );
  const summary = await inspectRepositoryFiles(
    files,
    (_candidate, file) =>
      fetchGitHubTextFile(
        reference.owner,
        reference.repo,
        file.path,
        file.sha,
        options.accessToken,
        ref,
        file.download_url
      ),
    {
      ...options,
      candidateFilter: (candidate) => {
        const matchesRequestedScope = matchesRepositoryScope(candidate.path, scope);
        const matchesCallerFilter = options.candidateFilter ? options.candidateFilter(candidate) : true;
        return matchesRequestedScope && matchesCallerFilter;
      },
      packageNameByPath,
    }
  );
  const repoMetadata = await fetchGitHubRepositoryMetadata(reference, options.accessToken);

  return {
    owner: reference.owner,
    repo: reference.repo,
    path: normalizeRepositoryPath(reference.path || "") || null,
    ref,
    repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
    ...summary,
    repoMetadata,
  };
};

export const repairGitHubRepositoryMeshReferences = async (
  reference: GitHubRepositoryReference,
  options: RepairGitHubRepositoryOptions = {}
): Promise<GitHubRepositoryMeshRepairResult> => {
  const { ref, files } = await fetchGitHubRepositoryFiles(reference, options.accessToken);
  const scope = resolveRepositoryScopeFromFiles(files, reference.path);
  if (reference.path && !scope) {
    throw new Error("GitHub repository path not found.");
  }
  const packageNameByPath = await buildPackageNameByPathFromRepositoryFiles(files, (file) =>
    fetchGitHubTextFile(
      reference.owner,
      reference.repo,
      file.path,
      file.sha,
      options.accessToken,
      ref,
      file.download_url
    )
  );
  const normalizedUrdfPath = resolveRepositoryScopedPathFromFiles(
    files,
    scope ?? {
      kind: "root",
      path: "",
    },
    options.urdfPath ?? reference.path ?? ""
  );
  if (!normalizedUrdfPath) {
    throw new Error(
      "GitHub repository repair requires --urdf unless the GitHub reference already points to a URDF or Xacro file."
    );
  }

  const targetFile = files.find(
    (file) => file.type === "file" && normalizeRepositoryPath(file.path) === normalizedUrdfPath
  );
  if (!targetFile) {
    throw new Error(`GitHub file not found in repository tree: ${normalizedUrdfPath}`);
  }

  const urdfContent = await fetchGitHubTextFile(
    reference.owner,
    reference.repo,
    targetFile.path,
    targetFile.sha,
    options.accessToken,
    ref,
    targetFile.download_url
  );
  const result = fixMissingMeshReferencesInRepository(
    urdfContent,
    targetFile.path,
    files,
    {
      ...options,
      packageNameByPath,
      normalizeResolvableReferences: options.normalizeResolvableReferences ?? true,
    }
  );

  return {
    owner: reference.owner,
    repo: reference.repo,
    path: normalizeRepositoryPath(reference.path || "") || null,
    ref,
    urdfPath: targetFile.path,
    repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
    ...result,
  };
};

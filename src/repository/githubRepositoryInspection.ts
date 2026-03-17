import { normalizeRepositoryPath } from "./repositoryMeshResolution";
import {
  inspectRepositoryFiles,
  type InspectRepositoryFilesOptions,
  type RepositoryCandidateInspection,
  type RepositoryInspectionSummary,
} from "./repositoryInspection";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_ACCEPT_HEADER = "application/vnd.github.v3+json";
const GITHUB_BAD_CREDENTIALS_PATTERN = /bad credentials/i;

type GitHubTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha?: string;
};

type GitHubDefaultBranchResponse = {
  default_branch?: string;
};

type GitHubTreeResponse = {
  tree?: GitHubTreeEntry[];
};

type GitHubBlobResponse = {
  content?: string;
  encoding?: string;
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

const sanitizeRepoSegment = (value: string): string => value.replace(/\.git$/i, "").trim();

const buildGitHubHeaders = (accessToken?: string): Headers => {
  const headers = new Headers();
  headers.set("Accept", GITHUB_API_ACCEPT_HEADER);
  if (accessToken) {
    headers.set("Authorization", `token ${accessToken}`);
  }
  return headers;
};

const fetchGitHubResponse = async (
  url: string,
  accessToken?: string
): Promise<{ response: Response; usedAnonymousFallback: boolean }> => {
  const response = await fetch(url, {
    headers: buildGitHubHeaders(accessToken),
  });

  if (!accessToken || response.status !== 401) {
    return { response, usedAnonymousFallback: false };
  }

  const body = await response.clone().text().catch(() => "");
  if (!GITHUB_BAD_CREDENTIALS_PATTERN.test(body)) {
    return { response, usedAnonymousFallback: false };
  }

  const retry = await fetch(url, {
    headers: buildGitHubHeaders(undefined),
  });
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

const decodeBase64ToUtf8 = (base64: string): string => {
  const cleaned = base64.replace(/\s/g, "");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(cleaned, "base64").toString("utf8");
  }
  const binary = globalThis.atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

export const parseGitHubRepositoryReference = (
  value: string
): GitHubRepositoryReference | null => {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;

  if (!trimmed.includes("github.com")) {
    const parts = trimmed.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return {
      owner: sanitizeRepoSegment(parts[0]),
      repo: sanitizeRepoSegment(parts[1]),
      path: parts.length > 2 ? parts.slice(2).join("/") : undefined,
    };
  }

  try {
    const url = new URL(trimmed);
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

const convertTreeToRepositoryFiles = (
  treeEntries: GitHubTreeEntry[],
  pathPrefix: string = ""
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
        download_url: null,
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

export const fetchGitHubRepositoryFiles = async (
  reference: GitHubRepositoryReference,
  accessToken?: string
): Promise<{ ref: string; files: GitHubRepositoryFile[] }> => {
  const ref = reference.ref || (await getDefaultBranch(reference.owner, reference.repo, accessToken));
  const normalizedPath = normalizeRepositoryPath(reference.path || "");

  const readTree = async (treePath: string) =>
    readGitHubJson<GitHubTreeResponse>(
      `${GITHUB_API_BASE_URL}/repos/${reference.owner}/${reference.repo}/git/trees/${
        treePath ? `${ref}:${treePath}` : ref
      }?recursive=1`,
      {
        accessToken,
        notFoundMessage: treePath
          ? "GitHub repository path not found."
          : "GitHub repository tree not found.",
        contextLabel: "reading repository tree",
      }
    );

  try {
    const tree = await readTree(normalizedPath);
    return {
      ref,
      files: convertTreeToRepositoryFiles(tree.tree ?? [], normalizedPath),
    };
  } catch (error) {
    if (!normalizedPath || !(error instanceof Error) || error.message !== "GitHub repository path not found.") {
      throw error;
    }

    const rootTree = await readTree("");
    const filtered = (rootTree.tree ?? []).filter((entry) => entry.path.startsWith(normalizedPath));
    if (filtered.length === 0) {
      throw error;
    }
    return {
      ref,
      files: convertTreeToRepositoryFiles(filtered, normalizedPath),
    };
  }
};

export const fetchGitHubTextFile = async (
  owner: string,
  repo: string,
  filePath: string,
  blobSha?: string,
  accessToken?: string
): Promise<string> => {
  const endpoint = blobSha
    ? `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/blobs/${blobSha}`
    : `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${filePath}`;
  const data = await readGitHubJson<GitHubBlobResponse>(endpoint, {
    accessToken,
    notFoundMessage: `GitHub file not found: ${filePath}`,
    contextLabel: `reading ${filePath}`,
  });

  if (!data.content || data.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content encoding for ${filePath}.`);
  }

  return decodeBase64ToUtf8(data.content);
};

export const inspectGitHubRepositoryUrdfs = async (
  reference: GitHubRepositoryReference,
  options: InspectGitHubRepositoryOptions = {}
): Promise<GitHubRepositoryInspectionResult> => {
  const { ref, files } = await fetchGitHubRepositoryFiles(reference, options.accessToken);
  const summary = await inspectRepositoryFiles(
    files,
    (_candidate, file) =>
      fetchGitHubTextFile(
        reference.owner,
        reference.repo,
        file.path,
        file.sha,
        options.accessToken
      ),
    options
  );

  return {
    owner: reference.owner,
    repo: reference.repo,
    path: normalizeRepositoryPath(reference.path || "") || null,
    ref,
    repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
    ...summary,
  };
};

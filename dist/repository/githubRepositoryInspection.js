"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairGitHubRepositoryMeshReferences = exports.inspectGitHubRepositoryUrdfs = exports.fetchGitHubFileBytes = exports.fetchGitHubTextFile = exports.fetchGitHubRepositoryFiles = exports.parseGitHubRepositoryReference = void 0;
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const fixMissingMeshReferences_1 = require("./fixMissingMeshReferences");
const repositoryInspection_1 = require("./repositoryInspection");
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_ACCEPT_HEADER = "application/vnd.github.v3+json";
const GITHUB_BAD_CREDENTIALS_PATTERN = /bad credentials/i;
const sanitizeRepoSegment = (value) => value.replace(/\.git$/i, "").trim();
const buildGitHubHeaders = (accessToken) => {
    const headers = new Headers();
    headers.set("Accept", GITHUB_API_ACCEPT_HEADER);
    if (accessToken) {
        headers.set("Authorization", `token ${accessToken}`);
    }
    return headers;
};
const fetchGitHubResponse = async (url, accessToken) => {
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
const readGitHubJson = async (url, { accessToken, notFoundMessage, contextLabel, }) => {
    let response;
    let usedAnonymousFallback = false;
    try {
        const result = await fetchGitHubResponse(url, accessToken);
        response = result.response;
        usedAnonymousFallback = result.usedAnonymousFallback;
    }
    catch (error) {
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
        throw new Error(`GitHub request failed while ${contextLabel}: ${response.status} ${response.statusText}${details ? ` - ${details.slice(0, 200)}` : ""}`);
    }
    return (await response.json());
};
const decodeBase64ToBytes = (base64) => {
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
const decodeBase64ToUtf8 = (base64) => new TextDecoder().decode(decodeBase64ToBytes(base64));
const parseGitHubRepositoryReference = (value) => {
    const trimmed = value.trim().replace(/\/$/, "");
    if (!trimmed)
        return null;
    if (!trimmed.includes("github.com")) {
        const parts = trimmed.split("/").filter(Boolean);
        if (parts.length < 2)
            return null;
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
        if (parts.length < 2)
            return null;
        const owner = sanitizeRepoSegment(parts[0]);
        const repo = sanitizeRepoSegment(parts[1]);
        let ref;
        let path;
        if ((parts[2] === "tree" || parts[2] === "blob") && parts.length >= 4) {
            ref = decodeURIComponent(parts[3]);
            path = parts.length > 4 ? parts.slice(4).join("/") : undefined;
        }
        else if (parts.length > 2) {
            path = parts.slice(2).join("/");
        }
        return { owner, repo, ref, path };
    }
    catch {
        return null;
    }
};
exports.parseGitHubRepositoryReference = parseGitHubRepositoryReference;
const getDefaultBranch = async (owner, repo, accessToken) => {
    const data = await readGitHubJson(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}`, {
        accessToken,
        notFoundMessage: "GitHub repository not found.",
        contextLabel: "reading repository metadata",
    });
    return data.default_branch || "main";
};
const convertTreeToRepositoryFiles = (treeEntries, pathPrefix = "") => {
    const files = [];
    const directories = new Set();
    const normalizedPrefix = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(pathPrefix);
    for (const entry of treeEntries) {
        const entryPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(entry.path);
        const fullPath = normalizedPrefix && !entryPath.startsWith(normalizedPrefix)
            ? (0, repositoryMeshResolution_1.normalizeRepositoryPath)(`${normalizedPrefix}/${entryPath}`)
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
const fetchGitHubRepositoryFiles = async (reference, accessToken) => {
    const ref = reference.ref || (await getDefaultBranch(reference.owner, reference.repo, accessToken));
    const normalizedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(reference.path || "");
    const readTree = async (treePath) => readGitHubJson(`${GITHUB_API_BASE_URL}/repos/${reference.owner}/${reference.repo}/git/trees/${treePath ? `${ref}:${treePath}` : ref}?recursive=1`, {
        accessToken,
        notFoundMessage: treePath
            ? "GitHub repository path not found."
            : "GitHub repository tree not found.",
        contextLabel: "reading repository tree",
    });
    try {
        const tree = await readTree(normalizedPath);
        return {
            ref,
            files: convertTreeToRepositoryFiles(tree.tree ?? [], normalizedPath),
        };
    }
    catch (error) {
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
exports.fetchGitHubRepositoryFiles = fetchGitHubRepositoryFiles;
const fetchGitHubTextFile = async (owner, repo, filePath, blobSha, accessToken) => {
    const bytes = await (0, exports.fetchGitHubFileBytes)(owner, repo, filePath, blobSha, accessToken);
    return new TextDecoder().decode(bytes);
};
exports.fetchGitHubTextFile = fetchGitHubTextFile;
const fetchGitHubFileBytes = async (owner, repo, filePath, blobSha, accessToken) => {
    const endpoint = blobSha
        ? `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/blobs/${blobSha}`
        : `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${filePath}`;
    const data = await readGitHubJson(endpoint, {
        accessToken,
        notFoundMessage: `GitHub file not found: ${filePath}`,
        contextLabel: `reading ${filePath}`,
    });
    if (!data.content || data.encoding !== "base64") {
        throw new Error(`Unsupported GitHub content encoding for ${filePath}.`);
    }
    return decodeBase64ToBytes(data.content);
};
exports.fetchGitHubFileBytes = fetchGitHubFileBytes;
const inspectGitHubRepositoryUrdfs = async (reference, options = {}) => {
    const { ref, files } = await (0, exports.fetchGitHubRepositoryFiles)(reference, options.accessToken);
    const summary = await (0, repositoryInspection_1.inspectRepositoryFiles)(files, (_candidate, file) => (0, exports.fetchGitHubTextFile)(reference.owner, reference.repo, file.path, file.sha, options.accessToken), options);
    return {
        owner: reference.owner,
        repo: reference.repo,
        path: (0, repositoryMeshResolution_1.normalizeRepositoryPath)(reference.path || "") || null,
        ref,
        repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
        ...summary,
    };
};
exports.inspectGitHubRepositoryUrdfs = inspectGitHubRepositoryUrdfs;
const repairGitHubRepositoryMeshReferences = async (reference, options = {}) => {
    const { ref, files } = await (0, exports.fetchGitHubRepositoryFiles)(reference, options.accessToken);
    const normalizedUrdfPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(options.urdfPath ?? reference.path ?? "");
    if (!normalizedUrdfPath) {
        throw new Error("GitHub repository repair requires --urdf unless the GitHub reference already points to a URDF or Xacro file.");
    }
    const targetFile = files.find((file) => file.type === "file" && (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path) === normalizedUrdfPath);
    if (!targetFile) {
        throw new Error(`GitHub file not found in repository tree: ${normalizedUrdfPath}`);
    }
    const urdfContent = await (0, exports.fetchGitHubTextFile)(reference.owner, reference.repo, targetFile.path, targetFile.sha, options.accessToken);
    const result = (0, fixMissingMeshReferences_1.fixMissingMeshReferencesInRepository)(urdfContent, targetFile.path, files, options);
    return {
        owner: reference.owner,
        repo: reference.repo,
        path: (0, repositoryMeshResolution_1.normalizeRepositoryPath)(reference.path || "") || null,
        ref,
        urdfPath: targetFile.path,
        repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
        ...result,
    };
};
exports.repairGitHubRepositoryMeshReferences = repairGitHubRepositoryMeshReferences;

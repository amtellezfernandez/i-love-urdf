"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairGitHubRepositoryMeshReferences = exports.inspectGitHubRepositoryUrdfs = exports.fetchGitHubFileBytes = exports.fetchGitHubTextFile = exports.fetchGitHubRepositoryFiles = exports.parseGitHubRepositoryReference = void 0;
exports.fetchGitHubRepositoryMetadata = fetchGitHubRepositoryMetadata;
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const fixMissingMeshReferences_1 = require("./fixMissingMeshReferences");
const repositoryInspection_1 = require("./repositoryInspection");
const repositoryPackageNames_1 = require("./repositoryPackageNames");
const repositoryPathScope_1 = require("./repositoryPathScope");
const repositoryUrdfDiscovery_1 = require("./repositoryUrdfDiscovery");
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_ACCEPT_HEADER = "application/vnd.github.v3+json";
const GITHUB_BAD_CREDENTIALS_PATTERN = /bad credentials/i;
const JSDELIVR_DATA_BASE_URL = "https://data.jsdelivr.com/v1";
const JSDELIVR_CDN_BASE_URL = "https://cdn.jsdelivr.net";
const GITHUB_FETCH_TIMEOUT_MS = 20000;
const PUBLIC_MIRROR_FETCH_TIMEOUT_MS = 20000;
const DEFAULT_INCLUDE_OWNER_PROFILE_IN_REPOSITORY_METADATA = true;
const GITHUB_NETWORK_ERROR_PATTERN = /Failed to fetch|NetworkError|fetch failed|Load failed|ECONNREFUSED|ERR_CONNECTION_REFUSED|ERR_NETWORK/i;
const DEFAULT_MAX_CANDIDATES_TO_INSPECT = 12;
const sanitizeRepoSegment = (value) => value.replace(/\.git$/i, "").trim();
const normalizeOptionalText = (value) => typeof value === "string" ? value.trim() : "";
const humanizeOwnerLabel = (owner) => owner.replace(/[-_]+/g, " ").trim();
const normalizeLicenseName = (payload) => {
    const spdxId = normalizeOptionalText(payload.license?.spdx_id);
    if (spdxId && spdxId.toUpperCase() !== "NOASSERTION") {
        return spdxId;
    }
    return normalizeOptionalText(payload.license?.name);
};
const normalizeGitHubTopics = (payload) => {
    if (!Array.isArray(payload.topics)) {
        return [];
    }
    const normalized = [];
    for (const topic of payload.topics) {
        const item = normalizeOptionalText(String(topic).replace(/-/g, " "));
        if (item && !normalized.includes(item)) {
            normalized.push(item);
        }
    }
    return normalized;
};
const normalizeGitHubXHandle = (value) => {
    const normalized = normalizeOptionalText(value);
    if (!normalized) {
        return "";
    }
    return normalized.startsWith("@") ? normalized : `@${normalized}`;
};
const buildGitHubHeaders = (accessToken) => {
    const headers = new Headers();
    headers.set("Accept", GITHUB_API_ACCEPT_HEADER);
    if (accessToken) {
        headers.set("Authorization", `token ${accessToken}`);
    }
    return headers;
};
const buildJsDelivrFlatUrl = (owner, repo, ref) => `${JSDELIVR_DATA_BASE_URL}/package/gh/${owner}/${repo}${ref ? `@${encodeURIComponent(ref)}` : ""}/flat`;
const buildJsDelivrFileUrl = (owner, repo, filePath, ref) => {
    const encodedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(filePath)
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${JSDELIVR_CDN_BASE_URL}/gh/${owner}/${repo}${ref ? `@${encodeURIComponent(ref)}` : ""}/${encodedPath}`;
};
const fetchWithTimeout = async (url, init, timeoutMs) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    }
    catch (error) {
        if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
            throw new Error(`request timed out after ${timeoutMs} ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
};
const isRecoverableGitHubError = (error) => {
    if (!(error instanceof Error))
        return false;
    return (/rate limit/i.test(error.message) ||
        /too many requests/i.test(error.message) ||
        /abuse detection/i.test(error.message) ||
        /secondary rate limit/i.test(error.message) ||
        /temporarily throttled/i.test(error.message) ||
        /token has no access/i.test(error.message) ||
        GITHUB_NETWORK_ERROR_PATTERN.test(error.message));
};
const resolveMaxCandidatesToInspect = (value) => Math.max(0, Number(value ?? DEFAULT_MAX_CANDIDATES_TO_INSPECT) || DEFAULT_MAX_CANDIDATES_TO_INSPECT);
const resolveScopedRepositoryCandidates = (files, scope, candidateFilter) => (0, repositoryUrdfDiscovery_1.findRepositoryUrdfCandidates)(files).filter((candidate) => {
    const matchesRequestedScope = (0, repositoryPathScope_1.matchesRepositoryScope)(candidate.path, scope);
    const matchesCallerFilter = candidateFilter ? candidateFilter(candidate) : true;
    return matchesRequestedScope && matchesCallerFilter;
});
const fetchGitHubResponse = async (url, accessToken) => {
    const response = await fetchWithTimeout(url, {
        headers: buildGitHubHeaders(accessToken),
    }, GITHUB_FETCH_TIMEOUT_MS);
    if (!accessToken || response.status !== 401) {
        return { response, usedAnonymousFallback: false };
    }
    const body = await response.clone().text().catch(() => "");
    if (!GITHUB_BAD_CREDENTIALS_PATTERN.test(body)) {
        return { response, usedAnonymousFallback: false };
    }
    const retry = await fetchWithTimeout(url, {
        headers: buildGitHubHeaders(undefined),
    }, GITHUB_FETCH_TIMEOUT_MS);
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
const readPublicMirrorJson = async (url, { notFoundMessage, contextLabel, }) => {
    let response;
    try {
        response = await fetchWithTimeout(url, {}, PUBLIC_MIRROR_FETCH_TIMEOUT_MS);
    }
    catch (error) {
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
        throw new Error(`Public mirror refused this repository request${details ? `: ${details.slice(0, 200)}` : "."}`);
    }
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`Public mirror request failed while ${contextLabel}: ${response.status} ${response.statusText}${details ? ` - ${details.slice(0, 200)}` : ""}`);
    }
    return (await response.json());
};
const readPublicMirrorBytes = async (url, filePath) => {
    let response;
    try {
        response = await fetchWithTimeout(url, {}, PUBLIC_MIRROR_FETCH_TIMEOUT_MS);
    }
    catch (error) {
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
        throw new Error(`Public mirror request failed while reading ${filePath}: ${response.status} ${response.statusText}${details ? ` - ${details.slice(0, 200)}` : ""}`);
    }
    return new Uint8Array(await response.arrayBuffer());
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
    const sshRemoteMatch = /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i.exec(trimmed);
    if (sshRemoteMatch?.groups) {
        return {
            owner: sanitizeRepoSegment(sshRemoteMatch.groups.owner),
            repo: sanitizeRepoSegment(sshRemoteMatch.groups.repo),
        };
    }
    const looksLikeGitHubHostReference = /^(?:(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^/@]+@)?(?:www\.)?github\.com\/|(?:www\.)?github\.com\/)/i.test(trimmed);
    if (!looksLikeGitHubHostReference) {
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^[^/]+@[^/]+[:/]/.test(trimmed)) {
            return null;
        }
        const parts = trimmed.split("/").filter(Boolean);
        if (parts.length < 2)
            return null;
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
const readGitHubApiJsonOrNull = async (url, accessToken) => {
    try {
        return await readGitHubJson(url, {
            accessToken,
            notFoundMessage: "GitHub repository not found.",
            contextLabel: "reading repository metadata",
        });
    }
    catch {
        return null;
    }
};
const readGitHubRepositoryApiPayloadOrNull = async (owner, repo, accessToken) => readGitHubApiJsonOrNull(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}`, accessToken);
const resolveFetchGitHubRepositoryMetadataOptions = (value) => {
    if (typeof value === "string") {
        return { accessToken: value };
    }
    return value ?? {};
};
async function fetchGitHubRepositoryMetadata(reference, accessTokenOrOptions = {}) {
    const options = resolveFetchGitHubRepositoryMetadataOptions(accessTokenOrOptions);
    const ownerLabel = humanizeOwnerLabel(reference.owner);
    const fallbackMetadata = (0, repositoryInspection_1.createEmptyRepositoryRepoMetadata)();
    fallbackMetadata.org = ownerLabel;
    fallbackMetadata.authorGithub = reference.owner;
    const repoPayload = options.repositoryPayload ??
        (await readGitHubRepositoryApiPayloadOrNull(reference.owner, reference.repo, options.accessToken));
    if (!repoPayload) {
        return fallbackMetadata;
    }
    const ownerLogin = normalizeOptionalText(repoPayload.owner?.login) || reference.owner;
    const ownerProfileUrl = normalizeOptionalText(repoPayload.owner?.url);
    const includeOwnerProfile = options.includeOwnerProfile ?? DEFAULT_INCLUDE_OWNER_PROFILE_IN_REPOSITORY_METADATA;
    const ownerProfile = includeOwnerProfile && ownerProfileUrl
        ? await readGitHubApiJsonOrNull(ownerProfileUrl, options.accessToken)
        : null;
    return {
        org: normalizeOptionalText(ownerProfile?.name) ||
            normalizeOptionalText(ownerProfile?.company) ||
            ownerLabel,
        summary: normalizeOptionalText(repoPayload.description),
        demo: normalizeOptionalText(repoPayload.homepage),
        tags: normalizeGitHubTopics(repoPayload),
        license: normalizeLicenseName(repoPayload),
        authorWebsite: normalizeOptionalText(ownerProfile?.blog) ||
            normalizeOptionalText(repoPayload.homepage),
        authorX: normalizeGitHubXHandle(ownerProfile?.twitter_username),
        authorLinkedin: "",
        authorGithub: ownerLogin,
        contact: normalizeOptionalText(ownerProfile?.email),
        extra: "",
        hfDatasets: [],
    };
}
const convertTreeToRepositoryFiles = (treeEntries, pathPrefix = "", options = {}) => {
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
                download_url: options.owner && options.repo
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
const fetchPublicMirrorRepositoryFiles = async (reference, ref, pathPrefix) => {
    const listing = await readPublicMirrorJson(buildJsDelivrFlatUrl(reference.owner, reference.repo, ref), {
        notFoundMessage: pathPrefix
            ? "GitHub repository path not found."
            : "GitHub repository not found.",
        contextLabel: "reading repository listing",
    });
    if (!Array.isArray(listing.files)) {
        throw new Error("Public mirror returned an invalid repository listing.");
    }
    const normalizedPrefix = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(pathPrefix);
    const files = [];
    const directories = new Set();
    for (const entry of listing.files) {
        const rawPath = typeof entry.name === "string" ? entry.name : entry.path;
        const repoPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(rawPath || "").replace(/^\/+/, "");
        if (!repoPath)
            continue;
        if (normalizedPrefix &&
            repoPath !== normalizedPrefix &&
            !repoPath.startsWith(`${normalizedPrefix}/`)) {
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
        if (normalizedPrefix &&
            dirPath !== normalizedPrefix &&
            !dirPath.startsWith(`${normalizedPrefix}/`)) {
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
            if (left.type === right.type)
                return 0;
            return left.type === "dir" ? -1 : 1;
        }
        return left.path.localeCompare(right.path);
    });
    return files;
};
const fetchGitHubRepositoryFiles = async (reference, accessToken) => {
    let ref = reference.ref;
    let repositoryPayload = null;
    if (!ref) {
        try {
            repositoryPayload = await readGitHubRepositoryApiPayloadOrNull(reference.owner, reference.repo, accessToken);
            if (!repositoryPayload) {
                throw new Error("GitHub repository not found.");
            }
            ref = repositoryPayload.default_branch || "main";
        }
        catch (error) {
            if (!isRecoverableGitHubError(error)) {
                throw error;
            }
            const files = await fetchPublicMirrorRepositoryFiles(reference, undefined, (0, repositoryMeshResolution_1.normalizeRepositoryPath)(reference.path || ""));
            return {
                ref: "HEAD",
                files,
                repositoryPayload: null,
            };
        }
    }
    const readTree = async () => readGitHubJson(`${GITHUB_API_BASE_URL}/repos/${reference.owner}/${reference.repo}/git/trees/${ref}?recursive=1`, {
        accessToken,
        notFoundMessage: "GitHub repository tree not found.",
        contextLabel: "reading repository tree",
    });
    try {
        const tree = await readTree();
        return {
            ref,
            files: convertTreeToRepositoryFiles(tree.tree ?? [], "", {
                owner: reference.owner,
                repo: reference.repo,
                ref,
            }),
            repositoryPayload,
        };
    }
    catch (error) {
        if (isRecoverableGitHubError(error)) {
            return {
                ref,
                files: await fetchPublicMirrorRepositoryFiles(reference, ref, ""),
                repositoryPayload,
            };
        }
        throw error;
    }
};
exports.fetchGitHubRepositoryFiles = fetchGitHubRepositoryFiles;
const fetchGitHubTextFile = async (owner, repo, filePath, blobSha, accessToken, ref, downloadUrl) => {
    const bytes = await (0, exports.fetchGitHubFileBytes)(owner, repo, filePath, blobSha, accessToken, ref, downloadUrl);
    return new TextDecoder().decode(bytes);
};
exports.fetchGitHubTextFile = fetchGitHubTextFile;
const fetchGitHubFileBytes = async (owner, repo, filePath, blobSha, accessToken, ref, downloadUrl) => {
    const publicMirrorUrl = downloadUrl || buildJsDelivrFileUrl(owner, repo, filePath, ref);
    if (!accessToken && publicMirrorUrl) {
        return readPublicMirrorBytes(publicMirrorUrl, filePath);
    }
    const endpoint = blobSha
        ? `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/blobs/${blobSha}`
        : `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${filePath}`;
    let data;
    try {
        data = await readGitHubJson(endpoint, {
            accessToken,
            notFoundMessage: `GitHub file not found: ${filePath}`,
            contextLabel: `reading ${filePath}`,
        });
    }
    catch (error) {
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
exports.fetchGitHubFileBytes = fetchGitHubFileBytes;
const inspectGitHubRepositoryUrdfs = async (reference, options = {}) => {
    const { ref, files, repositoryPayload } = await (0, exports.fetchGitHubRepositoryFiles)(reference, options.accessToken);
    const scope = (0, repositoryPathScope_1.resolveRepositoryScopeFromFiles)(files, reference.path);
    if (!scope) {
        throw new Error("GitHub repository path not found.");
    }
    const candidateFilter = (candidate) => {
        const matchesRequestedScope = (0, repositoryPathScope_1.matchesRepositoryScope)(candidate.path, scope);
        const matchesCallerFilter = options.candidateFilter ? options.candidateFilter(candidate) : true;
        return matchesRequestedScope && matchesCallerFilter;
    };
    const scopedCandidates = resolveScopedRepositoryCandidates(files, scope, options.candidateFilter);
    const inspectedCandidates = scopedCandidates.slice(0, resolveMaxCandidatesToInspect(options.maxCandidatesToInspect));
    const needsPackageNameByPath = inspectedCandidates.some((candidate) => !candidate.isXacro);
    const packageNameByPathPromise = needsPackageNameByPath
        ? (0, repositoryPackageNames_1.buildPackageNameByPathFromRepositoryFiles)(files, (file) => (0, exports.fetchGitHubTextFile)(reference.owner, reference.repo, file.path, file.sha, options.accessToken, ref, file.download_url))
        : Promise.resolve(undefined);
    const repoMetadataPromise = fetchGitHubRepositoryMetadata(reference, {
        accessToken: options.accessToken,
        repositoryPayload,
    });
    const summary = await (0, repositoryInspection_1.inspectRepositoryFiles)(files, (_candidate, file) => (0, exports.fetchGitHubTextFile)(reference.owner, reference.repo, file.path, file.sha, options.accessToken, ref, file.download_url), {
        ...options,
        candidateFilter,
        packageNameByPath: await packageNameByPathPromise,
    });
    const repoMetadata = await repoMetadataPromise;
    return {
        owner: reference.owner,
        repo: reference.repo,
        path: (0, repositoryMeshResolution_1.normalizeRepositoryPath)(reference.path || "") || null,
        ref,
        repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
        ...summary,
        repoMetadata,
    };
};
exports.inspectGitHubRepositoryUrdfs = inspectGitHubRepositoryUrdfs;
const repairGitHubRepositoryMeshReferences = async (reference, options = {}) => {
    const { ref, files } = await (0, exports.fetchGitHubRepositoryFiles)(reference, options.accessToken);
    const scope = (0, repositoryPathScope_1.resolveRepositoryScopeFromFiles)(files, reference.path);
    if (reference.path && !scope) {
        throw new Error("GitHub repository path not found.");
    }
    const packageNameByPath = await (0, repositoryPackageNames_1.buildPackageNameByPathFromRepositoryFiles)(files, (file) => (0, exports.fetchGitHubTextFile)(reference.owner, reference.repo, file.path, file.sha, options.accessToken, ref, file.download_url));
    const normalizedUrdfPath = (0, repositoryPathScope_1.resolveRepositoryScopedPathFromFiles)(files, scope ?? {
        kind: "root",
        path: "",
    }, options.urdfPath ?? reference.path ?? "");
    if (!normalizedUrdfPath) {
        throw new Error("GitHub repository repair requires --urdf unless the GitHub reference already points to a URDF or Xacro file.");
    }
    const targetFile = files.find((file) => file.type === "file" && (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path) === normalizedUrdfPath);
    if (!targetFile) {
        throw new Error(`GitHub file not found in repository tree: ${normalizedUrdfPath}`);
    }
    const urdfContent = await (0, exports.fetchGitHubTextFile)(reference.owner, reference.repo, targetFile.path, targetFile.sha, options.accessToken, ref, targetFile.download_url);
    const result = (0, fixMissingMeshReferences_1.fixMissingMeshReferencesInRepository)(urdfContent, targetFile.path, files, {
        ...options,
        packageNameByPath,
        normalizeResolvableReferences: options.normalizeResolvableReferences ?? true,
    });
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

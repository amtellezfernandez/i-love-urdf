"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGalleryPublishDraft = void 0;
const fs = require("node:fs");
const GALLERY_REPO_SLUG = "urdf-studio/urdf-robot-gallery";
const GALLERY_PR_BRANCH_PREFIX = "gallery-import";
const GALLERY_PREVIEWS_MANIFEST_VERSION = 1;
const normalizeRepoPath = (value) => String(value || "").replace(/\\/g, "/").trim().replace(/^\/+|\/+$/g, "");
const normalizeRepoKey = (owner, repo) => `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`;
const stripRobotSourceExtension = (value) => {
    const normalized = value.trim();
    if (normalized.toLowerCase().endsWith(".urdf.xacro"))
        return normalized.slice(0, -".urdf.xacro".length);
    if (normalized.toLowerCase().endsWith(".xacro"))
        return normalized.slice(0, -".xacro".length);
    if (normalized.toLowerCase().endsWith(".urdf"))
        return normalized.slice(0, -".urdf".length);
    return normalized;
};
const normalizeOptionalText = (value) => typeof value === "string" ? value.trim() : "";
const normalizeList = (value) => {
    if (!Array.isArray(value))
        return [];
    const normalized = [];
    for (const entry of value) {
        const item = normalizeOptionalText(entry);
        if (item && !normalized.includes(item)) {
            normalized.push(item);
        }
    }
    return normalized;
};
const buildGitHubRepoUrl = (source) => `https://github.com/${source.owner}/${source.repo}`;
const readJsonFile = (filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
};
const loadGalleryCatalogSnapshot = (manifest) => {
    const snapshotRoot = manifest.catalogSnapshot;
    if (!snapshotRoot || typeof snapshotRoot !== "object") {
        throw new Error("Gallery catalog snapshot is missing from the inspection manifest. Re-run gallery inspection while the gallery catalog is reachable before creating a publish draft.");
    }
    const repoEntriesRoot = snapshotRoot.repoEntries;
    const previewEntriesRoot = snapshotRoot.previewEntries;
    const repoEntries = Array.isArray(repoEntriesRoot)
        ? repoEntriesRoot.filter((entry) => !!entry && typeof entry === "object")
        : null;
    const previewEntries = Array.isArray(previewEntriesRoot)
        ? previewEntriesRoot.filter((entry) => !!entry && typeof entry === "object")
        : null;
    if (!repoEntries || !previewEntries) {
        throw new Error("Gallery catalog snapshot is invalid in the inspection manifest. Re-run gallery inspection before creating a publish draft.");
    }
    return { repoEntries, previewEntries };
};
const resolveGeneratedItems = (manifest) => {
    const rawItems = manifest.items;
    if (!Array.isArray(rawItems)) {
        throw new Error("Gallery manifest returned an invalid items list for publish draft generation.");
    }
    return rawItems.filter((item) => Boolean(item &&
        typeof item === "object" &&
        normalizeOptionalText(item.galleryRepoKey) &&
        normalizeOptionalText(item.galleryFileBase)));
};
const buildRepoManifestEntry = (spec, generatedItems, itemTitlesById) => {
    const repoKey = normalizeRepoKey(spec.source.owner, spec.source.repo);
    const normalizedPath = normalizeRepoPath(spec.source.path || "");
    const robots = generatedItems.map((item) => {
        const candidatePath = normalizeOptionalText(item.candidatePath);
        const sourcePath = normalizeOptionalText(item.sourcePath) || candidatePath;
        const fileName = sourcePath.split("/").pop() || sourcePath;
        return {
            name: itemTitlesById.get(candidatePath) || stripRobotSourceExtension(fileName),
            file: sourcePath,
            fileBase: normalizeOptionalText(item.galleryFileBase),
        };
    });
    return {
        repo: buildGitHubRepoUrl(spec.source),
        repoKey,
        path: normalizedPath,
        org: normalizeOptionalText(spec.repoMetadata.org),
        summary: normalizeOptionalText(spec.repoMetadata.summary),
        demo: normalizeOptionalText(spec.repoMetadata.demo),
        tags: normalizeList(spec.repoMetadata.tags),
        license: normalizeOptionalText(spec.repoMetadata.license),
        robots,
        hfDatasets: normalizeList(spec.repoMetadata.hfDatasets),
        authorWebsite: normalizeOptionalText(spec.repoMetadata.authorWebsite),
        authorX: normalizeOptionalText(spec.repoMetadata.authorX),
        authorLinkedin: normalizeOptionalText(spec.repoMetadata.authorLinkedin),
        authorGithub: normalizeOptionalText(spec.repoMetadata.authorGithub),
        contact: normalizeOptionalText(spec.repoMetadata.contact),
        extra: normalizeOptionalText(spec.repoMetadata.extra),
        updatedAt: new Date().toISOString(),
    };
};
const buildPreviewManifestEntry = (item) => {
    const candidatePath = normalizeOptionalText(item.candidatePath).toLowerCase();
    const sourceType = candidatePath.endsWith(".urdf.xacro")
        ? "urdf.xacro"
        : candidatePath.endsWith(".xacro")
            ? "xacro"
            : "urdf";
    return {
        repoKey: normalizeOptionalText(item.galleryRepoKey),
        fileBase: normalizeOptionalText(item.galleryFileBase),
        sourceType,
        tags: [`source:${sourceType}`],
        png: normalizeOptionalText(item.galleryPngPath),
        webm: normalizeOptionalText(item.galleryWebmPath),
    };
};
const buildDraftText = (spec) => {
    const timestampSlug = Math.floor(Date.now() / 1000);
    const branchName = `${GALLERY_PR_BRANCH_PREFIX}/${timestampSlug}-${spec.jobId.slice(0, 8)}`;
    let sourceLabel = `${spec.source.owner}/${spec.source.repo}`;
    if (normalizeRepoPath(spec.source.path || "")) {
        sourceLabel = `${sourceLabel}/${normalizeRepoPath(spec.source.path || "")}`;
    }
    return {
        title: `Add gallery assets for ${sourceLabel}`,
        body: [
            `Add generated gallery image and video assets from \`${sourceLabel}\`.`,
            "",
            `- Job: \`${spec.jobId}\``,
            `- Generated via ILU gallery publish draft`,
        ].join("\n"),
        branchName,
    };
};
const buildAssetDraftFiles = (generatedItems) => {
    const files = [];
    for (const item of generatedItems) {
        for (const [assetKey, targetKey, mediaType] of [
            ["thumbnailPath", "galleryPngPath", "image/png"],
            ["videoPath", "galleryWebmPath", "video/webm"],
        ]) {
            const sourcePath = normalizeOptionalText(item[assetKey]);
            if (!sourcePath)
                continue;
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Generated gallery asset is missing: ${sourcePath}`);
            }
            const targetPath = normalizeOptionalText(item[targetKey]);
            files.push({
                path: `docs/${targetPath}`,
                content: fs.readFileSync(sourcePath).toString("base64"),
                encoding: "base64",
                mediaType,
            });
        }
    }
    return files;
};
const buildGalleryPublishDraft = async (spec) => {
    const manifest = readJsonFile(spec.manifestPath);
    const generatedItems = resolveGeneratedItems(manifest);
    if (generatedItems.length === 0) {
        return {
            ...buildDraftText(spec),
            repoSlug: GALLERY_REPO_SLUG,
            files: [
                {
                    path: `imports/${spec.source.owner}/${spec.source.repo}/${spec.jobId}.json`,
                    content: `${JSON.stringify(spec, null, 2)}\n`,
                    encoding: "utf-8",
                },
            ],
        };
    }
    const catalog = loadGalleryCatalogSnapshot(manifest);
    const itemTitlesById = new Map(spec.items.map((item) => [item.id, item.title]));
    const repoKey = normalizeRepoKey(spec.source.owner, spec.source.repo);
    const selectedRepoEntry = buildRepoManifestEntry(spec, generatedItems, itemTitlesById);
    const repoEntries = catalog.repoEntries
        .map((entry) => ({ ...entry }))
        .filter((entry) => normalizeRepoPath(String(entry.repoKey || "")) !== repoKey);
    repoEntries.push(selectedRepoEntry);
    repoEntries.sort((left, right) => String(left.repoKey || "").localeCompare(String(right.repoKey || "")));
    const generatedPreviewEntries = generatedItems.map((item) => buildPreviewManifestEntry(item));
    const generatedKeys = new Set(generatedPreviewEntries.map((entry) => `${entry.repoKey}::${entry.fileBase}`));
    const previewEntries = catalog.previewEntries
        .map((entry) => ({ ...entry }))
        .filter((entry) => !generatedKeys.has(`${entry.repoKey}::${entry.fileBase}`));
    previewEntries.push(...generatedPreviewEntries);
    previewEntries.sort((left, right) => String(left.repoKey || "").localeCompare(String(right.repoKey || "")) ||
        String(left.fileBase || "").localeCompare(String(right.fileBase || "")));
    const files = [
        {
            path: "docs/robots.json",
            content: `${JSON.stringify(repoEntries, null, 2)}\n`,
            encoding: "utf-8",
        },
        {
            path: "docs/previews.json",
            content: `${JSON.stringify({
                version: GALLERY_PREVIEWS_MANIFEST_VERSION,
                generatedAt: new Date().toISOString(),
                previews: previewEntries,
            }, null, 2)}\n`,
            encoding: "utf-8",
        },
        ...buildAssetDraftFiles(generatedItems),
    ];
    return {
        ...buildDraftText(spec),
        repoSlug: GALLERY_REPO_SLUG,
        files,
    };
};
exports.buildGalleryPublishDraft = buildGalleryPublishDraft;

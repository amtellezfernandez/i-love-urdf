import * as fs from "node:fs";
import * as path from "node:path";

const GALLERY_REPO_SLUG = "urdf-studio/urdf-robot-gallery";
const GALLERY_PR_BRANCH_PREFIX = "gallery-import";
const GALLERY_PREVIEWS_MANIFEST_VERSION = 1;

export type GalleryPublishRepoMetadata = {
  org?: string;
  summary?: string;
  demo?: string;
  tags?: string[];
  license?: string;
  authorWebsite?: string;
  authorX?: string;
  authorLinkedin?: string;
  authorGithub?: string;
  contact?: string;
  extra?: string;
  hfDatasets?: string[];
};

export type GalleryPublishSpec = {
  jobId: string;
  source: {
    owner: string;
    repo: string;
    path?: string | null;
    branch?: string | null;
  };
  repoMetadata: GalleryPublishRepoMetadata;
  items: Array<{
    id: string;
    title: string;
  }>;
  manifestPath: string;
};

export type GalleryPublishDraftFile = {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
  mediaType?: string;
};

export type GalleryPublishDraft = {
  title: string;
  body: string;
  branchName: string;
  repoSlug: string;
  files: GalleryPublishDraftFile[];
};

type GalleryCatalog = {
  repoEntries: dict[];
  previewEntries: dict[];
};

type dict = Record<string, unknown>;

const normalizeRepoPath = (value: string | null | undefined): string =>
  String(value || "").replace(/\\/g, "/").trim().replace(/^\/+|\/+$/g, "");

const normalizeRepoKey = (owner: string, repo: string): string =>
  `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`;

const stripRobotSourceExtension = (value: string): string => {
  const normalized = value.trim();
  if (normalized.toLowerCase().endsWith(".urdf.xacro")) return normalized.slice(0, -".urdf.xacro".length);
  if (normalized.toLowerCase().endsWith(".xacro")) return normalized.slice(0, -".xacro".length);
  if (normalized.toLowerCase().endsWith(".urdf")) return normalized.slice(0, -".urdf".length);
  return normalized;
};

const normalizeOptionalText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized: string[] = [];
  for (const entry of value) {
    const item = normalizeOptionalText(entry);
    if (item && !normalized.includes(item)) {
      normalized.push(item);
    }
  }
  return normalized;
};

const buildGitHubRepoUrl = (source: GalleryPublishSpec["source"]): string =>
  `https://github.com/${source.owner}/${source.repo}`;

const readJsonFile = <T>(filePath: string): T => {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content) as T;
};

const loadGalleryCatalogSnapshot = (manifest: dict): GalleryCatalog => {
  const snapshotRoot = manifest.catalogSnapshot;
  if (!snapshotRoot || typeof snapshotRoot !== "object") {
    throw new Error(
      "Gallery catalog snapshot is missing from the inspection manifest. Re-run gallery inspection while the gallery catalog is reachable before creating a publish draft."
    );
  }
  const repoEntriesRoot = (snapshotRoot as dict).repoEntries;
  const previewEntriesRoot = (snapshotRoot as dict).previewEntries;
  const repoEntries = Array.isArray(repoEntriesRoot)
    ? repoEntriesRoot.filter((entry): entry is dict => !!entry && typeof entry === "object")
    : null;
  const previewEntries = Array.isArray(previewEntriesRoot)
    ? previewEntriesRoot.filter((entry): entry is dict => !!entry && typeof entry === "object")
    : null;
  if (!repoEntries || !previewEntries) {
    throw new Error(
      "Gallery catalog snapshot is invalid in the inspection manifest. Re-run gallery inspection before creating a publish draft."
    );
  }
  return { repoEntries, previewEntries };
};

const resolveGeneratedItems = (manifest: dict): dict[] => {
  const rawItems = manifest.items;
  if (!Array.isArray(rawItems)) {
    throw new Error("Gallery manifest returned an invalid items list for publish draft generation.");
  }
  return rawItems.filter(
    (item): item is dict =>
      Boolean(
        item &&
        typeof item === "object" &&
        normalizeOptionalText(item.galleryRepoKey) &&
        normalizeOptionalText(item.galleryFileBase)
      )
  );
};

const buildRepoManifestEntry = (
  spec: GalleryPublishSpec,
  generatedItems: dict[],
  itemTitlesById: Map<string, string>
): dict => {
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

const buildPreviewManifestEntry = (item: dict): dict => {
  const candidatePath = normalizeOptionalText(item.candidatePath).toLowerCase();
  const sourceType = candidatePath.endsWith(".urdf.xacro")
    ? "urdf.xacro"
    : candidatePath.endsWith(".xacro")
      ? "xacro"
      : "urdf";
  const entry: dict = {
    repoKey: normalizeOptionalText(item.galleryRepoKey),
    fileBase: normalizeOptionalText(item.galleryFileBase),
    sourceType,
    tags: [`source:${sourceType}`],
  };
  const pngPath = normalizeOptionalText(item.galleryPngPath);
  const webmPath = normalizeOptionalText(item.galleryWebmPath);
  if (pngPath) {
    entry.png = pngPath;
  }
  if (webmPath) {
    entry.webm = webmPath;
  }
  return entry;
};

const mergePreviewManifestEntry = (existingEntry: dict | undefined, item: dict): dict => {
  const mergedEntry = existingEntry ? { ...existingEntry } : {};
  const generatedEntry = buildPreviewManifestEntry(item);
  return {
    ...mergedEntry,
    ...generatedEntry,
  };
};

const buildDraftText = (spec: GalleryPublishSpec): { title: string; body: string; branchName: string } => {
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

const buildAssetDraftFiles = (generatedItems: dict[]): GalleryPublishDraftFile[] => {
  const files: GalleryPublishDraftFile[] = [];
  for (const item of generatedItems) {
    for (const [assetKey, targetKey, mediaType] of [
      ["thumbnailPath", "galleryPngPath", "image/png"],
      ["videoPath", "galleryWebmPath", "video/webm"],
    ] as const) {
      const sourcePath = normalizeOptionalText(item[assetKey]);
      if (!sourcePath) continue;
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

export const buildGalleryPublishDraft = async (spec: GalleryPublishSpec): Promise<GalleryPublishDraft> => {
  const manifest = readJsonFile<dict>(spec.manifestPath);
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

  const previewEntryByKey = new Map(
    catalog.previewEntries.map((entry) => [
      `${normalizeOptionalText(entry.repoKey)}::${normalizeOptionalText(entry.fileBase)}`,
      entry,
    ])
  );
  const generatedPreviewEntries = generatedItems.map((item) =>
    mergePreviewManifestEntry(
      previewEntryByKey.get(
        `${normalizeOptionalText(item.galleryRepoKey)}::${normalizeOptionalText(item.galleryFileBase)}`
      ),
      item
    )
  );
  const generatedKeys = new Set(
    generatedPreviewEntries.map((entry) => `${entry.repoKey}::${entry.fileBase}`)
  );
  const previewEntries = catalog.previewEntries
    .map((entry) => ({ ...entry }))
    .filter((entry) => !generatedKeys.has(`${entry.repoKey}::${entry.fileBase}`));
  previewEntries.push(...generatedPreviewEntries);
  previewEntries.sort(
    (left, right) =>
      String(left.repoKey || "").localeCompare(String(right.repoKey || "")) ||
      String(left.fileBase || "").localeCompare(String(right.fileBase || ""))
  );

  const files: GalleryPublishDraftFile[] = [
    {
      path: "docs/robots.json",
      content: `${JSON.stringify(repoEntries, null, 2)}\n`,
      encoding: "utf-8",
    },
    {
      path: "docs/previews.json",
      content: `${JSON.stringify(
        {
          version: GALLERY_PREVIEWS_MANIFEST_VERSION,
          generatedAt: new Date().toISOString(),
          previews: previewEntries,
        },
        null,
        2
      )}\n`,
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

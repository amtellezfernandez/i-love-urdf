import * as fs from "node:fs";
import * as path from "node:path";
import {
  runGalleryBatchForRepo,
  runGalleryForCurrentUrdf,
  type GalleryRepoSource,
} from "../gallery/galleryGeneration";
import { buildGalleryPublishDraft, type GalleryPublishSpec } from "../gallery/galleryPublish";
import { renderRepoMediaBatch, type RepoMediaRenderAssetKind } from "../gallery/repoMediaRender";
import { resolveGitHubAccessToken } from "../node/githubCliAuth";
import { inspectGitHubRepositoryUrdfs } from "../repository/githubRepositoryInspection";
import { inspectLocalRepositoryUrdfs } from "../repository/localRepositoryInspection";
import { emitJsonPayload, resolveGitHubRepositoryReference, type SourceCommandHandler } from "./sourceCommandRuntime";

const formatGitHubBatchReference = (params: {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
}): string =>
  `https://github.com/${params.owner}/${params.repo}${
    params.ref ? `/tree/${encodeURIComponent(params.ref)}` : ""
  }${params.path ? `/${params.path.replace(/^\/+/, "")}` : ""}`;

const getMultiStringArg = (args: Parameters<SourceCommandHandler>[0], key: string): string[] => {
  const value = args.get(key);
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const resolveRenderAssetKinds = (
  args: Parameters<SourceCommandHandler>[0],
  helpers: Parameters<SourceCommandHandler>[1]
): RepoMediaRenderAssetKind[] => {
  const requested = getMultiStringArg(args, "asset");
  if (requested.length === 0) {
    return ["image", "video"];
  }

  const normalized: RepoMediaRenderAssetKind[] = [];
  for (const value of requested) {
    const assetKind = value.toLowerCase();
    if (assetKind !== "image" && assetKind !== "video") {
      helpers.fail(`Unsupported --asset value: ${value}`);
    }
    if (!normalized.includes(assetKind)) {
      normalized.push(assetKind);
    }
  }
  return normalized;
};

export const SOURCE_GALLERY_COMMAND_HANDLERS = {
  "gallery-generate": async (args, helpers) => {
    const urdfPath = helpers.getOptionalStringArg(args, "urdf");
    const local = helpers.getOptionalStringArg(args, "local");
    const github = helpers.getOptionalStringArg(args, "github");
    const modeCount = (urdfPath ? 1 : 0) + (local ? 1 : 0) + (github ? 1 : 0);
    if (modeCount !== 1) {
      helpers.fail("gallery-generate requires exactly one of --urdf, --local, or --github.");
    }

    const outPath = helpers.getOptionalStringArg(args, "out");
    if (urdfPath) {
      const absoluteUrdfPath = path.resolve(urdfPath);
      const result = await runGalleryForCurrentUrdf({
        kind: "current",
        sourceLabel: absoluteUrdfPath,
        urdfPath: absoluteUrdfPath,
        urdfContent: fs.readFileSync(absoluteUrdfPath, "utf8"),
        loadedSource: {
          source: "local-file",
          urdfPath: absoluteUrdfPath,
          localPath: absoluteUrdfPath,
        },
      }, outPath);
      emitJsonPayload(helpers, undefined, result);
      return;
    }

    const source: GalleryRepoSource = local
      ? {
          kind: "local",
          localPath: path.resolve(local),
          sourceLabel: path.resolve(local),
        }
      : (() => {
          const reference = resolveGitHubRepositoryReference(args, github || "", helpers);
          return {
            kind: "github" as const,
            githubRef: formatGitHubBatchReference(reference),
            sourceLabel: formatGitHubBatchReference(reference),
          };
        })();

    const candidates =
      source.kind === "local"
        ? (await inspectLocalRepositoryUrdfs({ path: source.localPath })).candidates
        : (
            await inspectGitHubRepositoryUrdfs(
              resolveGitHubRepositoryReference(args, github || "", helpers),
              {
                accessToken: resolveGitHubAccessToken(undefined),
              }
            )
          ).candidates;

    const result = await runGalleryBatchForRepo(source, candidates, {
      mode: "gallery",
      outputRoot: outPath,
    });
    emitJsonPayload(helpers, undefined, result);
  },

  "gallery-render": async (args, helpers) => {
    const local = helpers.getOptionalStringArg(args, "local");
    const github = helpers.getOptionalStringArg(args, "github");
    if ((local ? 1 : 0) + (github ? 1 : 0) !== 1) {
      helpers.fail("gallery-render requires exactly one of --local or --github.");
    }

    const outputRoot = helpers.getOptionalStringArg(args, "out");
    if (!outputRoot) {
      helpers.fail("gallery-render requires --out.");
    }
    const appUrl = helpers.getOptionalStringArg(args, "app");
    if (!appUrl) {
      helpers.fail("gallery-render requires --app.");
    }

    const candidatePaths = getMultiStringArg(args, "urdf");
    if (candidatePaths.length === 0) {
      helpers.fail("gallery-render requires at least one --urdf.");
    }

    const assetKinds = resolveRenderAssetKinds(args, helpers);
    const source = local
      ? {
          kind: "local" as const,
          localPath: path.resolve(local),
        }
      : (() => {
          const reference = resolveGitHubRepositoryReference(args, github || "", helpers);
          return {
            kind: "github" as const,
            githubUrl: formatGitHubBatchReference(reference),
            sourcePath: reference.path,
            ref: reference.ref,
          };
        })();

    const result = await renderRepoMediaBatch(source, appUrl, path.resolve(outputRoot), candidatePaths, assetKinds);
    emitJsonPayload(helpers, undefined, result);
  },

  "gallery-build-publish": async (args, helpers) => {
    const specPath = helpers.getOptionalStringArg(args, "spec");
    if (!specPath) {
      helpers.fail("gallery-build-publish requires --spec.");
    }

    const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), "utf8")) as GalleryPublishSpec;
    const result = await buildGalleryPublishDraft(spec);
    emitJsonPayload(helpers, helpers.getOptionalStringArg(args, "out"), result);
  },

  "repo-fixes": async (args, helpers) => {
    const local = helpers.getOptionalStringArg(args, "local");
    const github = helpers.getOptionalStringArg(args, "github");
    if ((local ? 1 : 0) + (github ? 1 : 0) !== 1) {
      helpers.fail("repo-fixes requires exactly one of --local or --github.");
    }

    const outPath = helpers.getOptionalStringArg(args, "out");
    const source: GalleryRepoSource = local
      ? {
          kind: "local",
          localPath: path.resolve(local),
          sourceLabel: path.resolve(local),
        }
      : (() => {
          const reference = resolveGitHubRepositoryReference(args, github || "", helpers);
          return {
            kind: "github" as const,
            githubRef: formatGitHubBatchReference(reference),
            sourceLabel: formatGitHubBatchReference(reference),
          };
        })();

    const candidates =
      source.kind === "local"
        ? (await inspectLocalRepositoryUrdfs({ path: source.localPath })).candidates
        : (
            await inspectGitHubRepositoryUrdfs(
              resolveGitHubRepositoryReference(args, github || "", helpers),
              {
                accessToken: resolveGitHubAccessToken(undefined),
              }
            )
          ).candidates;

    const result = await runGalleryBatchForRepo(source, candidates, {
      mode: "repo-fixes",
      outputRoot: outPath,
    });
    emitJsonPayload(helpers, undefined, result);
  },
} satisfies Record<"gallery-generate" | "gallery-render" | "gallery-build-publish" | "repo-fixes", SourceCommandHandler>;

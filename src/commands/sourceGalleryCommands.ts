import * as fs from "node:fs";
import * as path from "node:path";
import {
  runGalleryBatchForRepo,
  runGalleryForCurrentUrdf,
  type GalleryRepoSource,
} from "../gallery/galleryGeneration";
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
} satisfies Record<"gallery-generate" | "repo-fixes", SourceCommandHandler>;

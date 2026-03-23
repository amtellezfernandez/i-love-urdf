"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_GALLERY_COMMAND_HANDLERS = void 0;
const fs = require("node:fs");
const path = require("node:path");
const galleryGeneration_1 = require("../gallery/galleryGeneration");
const githubCliAuth_1 = require("../node/githubCliAuth");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const sourceCommandRuntime_1 = require("./sourceCommandRuntime");
const formatGitHubBatchReference = (params) => `https://github.com/${params.owner}/${params.repo}${params.ref ? `/tree/${encodeURIComponent(params.ref)}` : ""}${params.path ? `/${params.path.replace(/^\/+/, "")}` : ""}`;
exports.SOURCE_GALLERY_COMMAND_HANDLERS = {
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
            const result = await (0, galleryGeneration_1.runGalleryForCurrentUrdf)({
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
            (0, sourceCommandRuntime_1.emitJsonPayload)(helpers, undefined, result);
            return;
        }
        const source = local
            ? {
                kind: "local",
                localPath: path.resolve(local),
                sourceLabel: path.resolve(local),
            }
            : (() => {
                const reference = (0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers);
                return {
                    kind: "github",
                    githubRef: formatGitHubBatchReference(reference),
                    sourceLabel: formatGitHubBatchReference(reference),
                };
            })();
        const candidates = source.kind === "local"
            ? (await (0, localRepositoryInspection_1.inspectLocalRepositoryUrdfs)({ path: source.localPath })).candidates
            : (await (0, githubRepositoryInspection_1.inspectGitHubRepositoryUrdfs)((0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers), {
                accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(undefined),
            })).candidates;
        const result = await (0, galleryGeneration_1.runGalleryBatchForRepo)(source, candidates, {
            mode: "gallery",
            outputRoot: outPath,
        });
        (0, sourceCommandRuntime_1.emitJsonPayload)(helpers, undefined, result);
    },
    "repo-fixes": async (args, helpers) => {
        const local = helpers.getOptionalStringArg(args, "local");
        const github = helpers.getOptionalStringArg(args, "github");
        if ((local ? 1 : 0) + (github ? 1 : 0) !== 1) {
            helpers.fail("repo-fixes requires exactly one of --local or --github.");
        }
        const outPath = helpers.getOptionalStringArg(args, "out");
        const source = local
            ? {
                kind: "local",
                localPath: path.resolve(local),
                sourceLabel: path.resolve(local),
            }
            : (() => {
                const reference = (0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers);
                return {
                    kind: "github",
                    githubRef: formatGitHubBatchReference(reference),
                    sourceLabel: formatGitHubBatchReference(reference),
                };
            })();
        const candidates = source.kind === "local"
            ? (await (0, localRepositoryInspection_1.inspectLocalRepositoryUrdfs)({ path: source.localPath })).candidates
            : (await (0, githubRepositoryInspection_1.inspectGitHubRepositoryUrdfs)((0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers), {
                accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(undefined),
            })).candidates;
        const result = await (0, galleryGeneration_1.runGalleryBatchForRepo)(source, candidates, {
            mode: "repo-fixes",
            outputRoot: outPath,
        });
        (0, sourceCommandRuntime_1.emitJsonPayload)(helpers, undefined, result);
    },
};

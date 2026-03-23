"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_REPOSITORY_COMMAND_HANDLERS = void 0;
const githubCliAuth_1 = require("../node/githubCliAuth");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const sourceCommandRuntime_1 = require("./sourceCommandRuntime");
exports.SOURCE_REPOSITORY_COMMAND_HANDLERS = {
    "inspect-repo": async (args, helpers) => {
        const github = helpers.getOptionalStringArg(args, "github");
        const local = helpers.getOptionalStringArg(args, "local");
        if ((github ? 1 : 0) + (local ? 1 : 0) !== 1) {
            helpers.fail("inspect-repo requires exactly one of --github or --local.");
        }
        const outPath = helpers.getOptionalStringArg(args, "out");
        const inspectionOptions = (0, sourceCommandRuntime_1.getRepositoryInspectionOptions)(args, helpers);
        const result = local
            ? await (0, localRepositoryInspection_1.inspectLocalRepositoryUrdfs)({ path: local }, inspectionOptions)
            : await (0, githubRepositoryInspection_1.inspectGitHubRepositoryUrdfs)((0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers), {
                accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(helpers.getOptionalStringArg(args, "token")),
                ...inspectionOptions,
            });
        (0, sourceCommandRuntime_1.emitJsonPayload)(helpers, outPath, result);
    },
    "repair-mesh-refs": async (args, helpers) => {
        const github = helpers.getOptionalStringArg(args, "github");
        const local = helpers.getOptionalStringArg(args, "local");
        if ((github ? 1 : 0) + (local ? 1 : 0) !== 1) {
            helpers.fail("repair-mesh-refs requires exactly one of --github or --local.");
        }
        const requestedUrdfPath = helpers.getOptionalStringArg(args, "urdf");
        const outPath = helpers.getOptionalStringArg(args, "out");
        const result = local
            ? await (0, localRepositoryInspection_1.repairLocalRepositoryMeshReferences)({ path: local }, {
                urdfPath: requestedUrdfPath,
            })
            : await (0, githubRepositoryInspection_1.repairGitHubRepositoryMeshReferences)((0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers), {
                accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(helpers.getOptionalStringArg(args, "token")),
                urdfPath: requestedUrdfPath,
            });
        (0, sourceCommandRuntime_1.emitTextOutputPayload)(helpers, outPath, result.content, result);
    },
};

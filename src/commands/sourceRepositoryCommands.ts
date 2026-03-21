import { resolveGitHubAccessToken } from "../node/githubCliAuth";
import {
  inspectGitHubRepositoryUrdfs,
  repairGitHubRepositoryMeshReferences,
} from "../repository/githubRepositoryInspection";
import {
  inspectLocalRepositoryUrdfs,
  repairLocalRepositoryMeshReferences,
} from "../repository/localRepositoryInspection";
import {
  emitJsonPayload,
  emitTextOutputPayload,
  getRepositoryInspectionOptions,
  resolveGitHubRepositoryReference,
  type SourceCommandHandler,
} from "./sourceCommandRuntime";

export const SOURCE_REPOSITORY_COMMAND_HANDLERS = {
  "inspect-repo": async (args, helpers) => {
    const github = helpers.getOptionalStringArg(args, "github");
    const local = helpers.getOptionalStringArg(args, "local");
    if ((github ? 1 : 0) + (local ? 1 : 0) !== 1) {
      helpers.fail("inspect-repo requires exactly one of --github or --local.");
    }

    const outPath = helpers.getOptionalStringArg(args, "out");
    const inspectionOptions = getRepositoryInspectionOptions(args, helpers);
    const result = local
      ? await inspectLocalRepositoryUrdfs({ path: local }, inspectionOptions)
      : await inspectGitHubRepositoryUrdfs(resolveGitHubRepositoryReference(args, github || "", helpers), {
          accessToken: resolveGitHubAccessToken(helpers.getOptionalStringArg(args, "token")),
          ...inspectionOptions,
        });

    emitJsonPayload(helpers, outPath, result);
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
      ? await repairLocalRepositoryMeshReferences(
          { path: local },
          {
            urdfPath: requestedUrdfPath,
          }
        )
      : await repairGitHubRepositoryMeshReferences(
          resolveGitHubRepositoryReference(args, github || "", helpers),
          {
            accessToken: resolveGitHubAccessToken(helpers.getOptionalStringArg(args, "token")),
            urdfPath: requestedUrdfPath,
          }
        );

    emitTextOutputPayload(helpers, outPath, result.content, result);
  },
} satisfies Record<"inspect-repo" | "repair-mesh-refs", SourceCommandHandler>;

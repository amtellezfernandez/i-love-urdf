import { resolveGitHubAccessToken } from "../node/githubCliAuth";
import { convertLocalSourcePathToUSD, convertURDFPathToUSD } from "../node/urdfUsdNode";
import { loadSourceFromGitHub, loadSourceFromPath } from "../sources/loadSourceNode";
import {
  emitJson,
  emitTextOutputPayload,
  getRepositoryInspectionOptions,
  getXacroRuntimeOptions,
  resolveGitHubRepositoryReference,
  type SourceCommandHandler,
} from "./sourceCommandRuntime";

export const SOURCE_LOAD_COMMAND_HANDLERS = {
  "load-source": async (args, helpers) => {
    const localPath = helpers.getOptionalStringArg(args, "path");
    const github = helpers.getOptionalStringArg(args, "github");
    if ((localPath ? 1 : 0) + (github ? 1 : 0) !== 1) {
      helpers.fail("load-source requires exactly one of --path or --github.");
    }

    const outPath = helpers.getOptionalStringArg(args, "out");
    const runtimeOptions = getXacroRuntimeOptions(args, helpers);
    const runtimeArgs = helpers.getKeyValueArg(args, "args", "arg");
    const useInorder = !Boolean(args.get("no-inorder"));
    const entryPath = helpers.getOptionalStringArg(args, "entry");
    const inspectionOptions = getRepositoryInspectionOptions(args, helpers);

    const result = localPath
      ? await loadSourceFromPath({
          path: localPath,
          entryPath,
          rootPath: helpers.getOptionalStringArg(args, "root"),
          args: runtimeArgs,
          useInorder,
          ...inspectionOptions,
          ...runtimeOptions,
        })
      : await loadSourceFromGitHub({
          reference: resolveGitHubRepositoryReference(args, github || "", helpers, "subdir"),
          entryPath,
          accessToken: resolveGitHubAccessToken(helpers.getOptionalStringArg(args, "token")),
          args: runtimeArgs,
          useInorder,
          ...inspectionOptions,
          ...runtimeOptions,
        });

    emitTextOutputPayload(helpers, outPath, result.urdf, result);
  },

  "urdf-to-usd": async (args, helpers) => {
    const directUrdfPath = helpers.getOptionalStringArg(args, "urdf");
    const sourcePath = helpers.getOptionalStringArg(args, "path");
    if ((directUrdfPath ? 1 : 0) + (sourcePath ? 1 : 0) !== 1) {
      helpers.fail("urdf-to-usd requires exactly one of --urdf or --path.");
    }

    const result = sourcePath
      ? await convertLocalSourcePathToUSD({
          path: sourcePath,
          entryPath: helpers.getOptionalStringArg(args, "entry"),
          args: helpers.getKeyValueArg(args, "args", "arg"),
          useInorder: !Boolean(args.get("no-inorder")),
          ...getXacroRuntimeOptions(args, helpers),
          outputPath: helpers.getOptionalStringArg(args, "out"),
          rootPath: helpers.getOptionalStringArg(args, "root"),
        })
      : await convertURDFPathToUSD(directUrdfPath || "", {
          outputPath: helpers.getOptionalStringArg(args, "out"),
          rootPath: helpers.getOptionalStringArg(args, "root"),
        });

    emitJson(result);
  },
} satisfies Record<"load-source" | "urdf-to-usd", SourceCommandHandler>;

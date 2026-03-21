import * as path from "node:path";
import { resolveGitHubAccessToken } from "../node/githubCliAuth";
import {
  expandGitHubRepositoryXacro,
  expandLocalXacroToUrdf,
  probeXacroRuntime,
  setupXacroRuntime,
} from "../xacro/xacroNode";
import {
  emitJson,
  emitTextOutputPayload,
  getXacroRuntimeOptions,
  resolveGitHubRepositoryReference,
  type SourceCommandHandler,
} from "./sourceCommandRuntime";

export const SOURCE_XACRO_COMMAND_HANDLERS = {
  "xacro-to-urdf": async (args, helpers) => {
    const github = helpers.getOptionalStringArg(args, "github");
    const local = helpers.getOptionalStringArg(args, "local");
    if ((github ? 1 : 0) + (local ? 1 : 0) > 1) {
      helpers.fail("xacro-to-urdf accepts at most one of --github or --local.");
    }

    const xacroPath = helpers.getOptionalStringArg(args, "xacro") ?? helpers.getOptionalStringArg(args, "entry");
    if (!xacroPath) {
      helpers.fail("Missing required argument --xacro (or --entry for repository sources).");
    }

    const outPath = helpers.getOptionalStringArg(args, "out");
    const runtimeOptions = getXacroRuntimeOptions(args, helpers);
    const runtimeArgs = helpers.getKeyValueArg(args, "args", "arg");
    const useInorder = !Boolean(args.get("no-inorder"));
    const result = local
      ? await expandLocalXacroToUrdf({
          xacroPath: path.resolve(local, xacroPath),
          rootPath: local,
          args: runtimeArgs,
          useInorder,
          ...runtimeOptions,
        })
      : github
        ? await expandGitHubRepositoryXacro(resolveGitHubRepositoryReference(args, github || "", helpers), {
            targetPath: xacroPath,
            accessToken: resolveGitHubAccessToken(helpers.getOptionalStringArg(args, "token")),
            args: runtimeArgs,
            useInorder,
            ...runtimeOptions,
          })
        : await expandLocalXacroToUrdf({
            xacroPath,
            rootPath: helpers.getOptionalStringArg(args, "root"),
            args: runtimeArgs,
            useInorder,
            ...runtimeOptions,
          });

    emitTextOutputPayload(helpers, outPath, result.urdf, result);
  },

  "probe-xacro-runtime": async (args, helpers) => {
    emitJson(await probeXacroRuntime(getXacroRuntimeOptions(args, helpers)));
  },

  "setup-xacro-runtime": async (args, helpers) => {
    emitJson(
      await setupXacroRuntime({
        ...getXacroRuntimeOptions(args, helpers),
        venvPath: helpers.getOptionalStringArg(args, "venv"),
      })
    );
  },
} satisfies Record<
  "xacro-to-urdf" | "probe-xacro-runtime" | "setup-xacro-runtime",
  SourceCommandHandler
>;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_XACRO_COMMAND_HANDLERS = void 0;
const path = require("node:path");
const githubCliAuth_1 = require("../node/githubCliAuth");
const xacroNode_1 = require("../xacro/xacroNode");
const sourceCommandRuntime_1 = require("./sourceCommandRuntime");
exports.SOURCE_XACRO_COMMAND_HANDLERS = {
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
        const runtimeOptions = (0, sourceCommandRuntime_1.getXacroRuntimeOptions)(args, helpers);
        const runtimeArgs = helpers.getKeyValueArg(args, "args", "arg");
        const useInorder = !Boolean(args.get("no-inorder"));
        const result = local
            ? await (0, xacroNode_1.expandLocalXacroToUrdf)({
                xacroPath: path.resolve(local, xacroPath),
                rootPath: local,
                args: runtimeArgs,
                useInorder,
                ...runtimeOptions,
            })
            : github
                ? await (0, xacroNode_1.expandGitHubRepositoryXacro)((0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers), {
                    targetPath: xacroPath,
                    accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(helpers.getOptionalStringArg(args, "token")),
                    args: runtimeArgs,
                    useInorder,
                    ...runtimeOptions,
                })
                : await (0, xacroNode_1.expandLocalXacroToUrdf)({
                    xacroPath,
                    rootPath: helpers.getOptionalStringArg(args, "root"),
                    args: runtimeArgs,
                    useInorder,
                    ...runtimeOptions,
                });
        (0, sourceCommandRuntime_1.emitTextOutputPayload)(helpers, outPath, result.urdf, result);
    },
    "probe-xacro-runtime": async (args, helpers) => {
        (0, sourceCommandRuntime_1.emitJson)(await (0, xacroNode_1.probeXacroRuntime)((0, sourceCommandRuntime_1.getXacroRuntimeOptions)(args, helpers)));
    },
    "setup-xacro-runtime": async (args, helpers) => {
        (0, sourceCommandRuntime_1.emitJson)(await (0, xacroNode_1.setupXacroRuntime)({
            ...(0, sourceCommandRuntime_1.getXacroRuntimeOptions)(args, helpers),
            venvPath: helpers.getOptionalStringArg(args, "venv"),
        }));
    },
};

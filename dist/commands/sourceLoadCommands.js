"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_LOAD_COMMAND_HANDLERS = void 0;
const githubCliAuth_1 = require("../node/githubCliAuth");
const urdfUsdNode_1 = require("../node/urdfUsdNode");
const loadSourceNode_1 = require("../sources/loadSourceNode");
const sourceCommandRuntime_1 = require("./sourceCommandRuntime");
exports.SOURCE_LOAD_COMMAND_HANDLERS = {
    "load-source": async (args, helpers) => {
        const localPath = helpers.getOptionalStringArg(args, "path");
        const github = helpers.getOptionalStringArg(args, "github");
        if ((localPath ? 1 : 0) + (github ? 1 : 0) !== 1) {
            helpers.fail("load-source requires exactly one of --path or --github.");
        }
        const outPath = helpers.getOptionalStringArg(args, "out");
        const runtimeOptions = (0, sourceCommandRuntime_1.getXacroRuntimeOptions)(args, helpers);
        const runtimeArgs = helpers.getKeyValueArg(args, "args", "arg");
        const useInorder = !Boolean(args.get("no-inorder"));
        const entryPath = helpers.getOptionalStringArg(args, "entry");
        const inspectionOptions = (0, sourceCommandRuntime_1.getRepositoryInspectionOptions)(args, helpers);
        const result = localPath
            ? await (0, loadSourceNode_1.loadSourceFromPath)({
                path: localPath,
                entryPath,
                rootPath: helpers.getOptionalStringArg(args, "root"),
                args: runtimeArgs,
                useInorder,
                ...inspectionOptions,
                ...runtimeOptions,
            })
            : await (0, loadSourceNode_1.loadSourceFromGitHub)({
                reference: (0, sourceCommandRuntime_1.resolveGitHubRepositoryReference)(args, github || "", helpers, "subdir"),
                entryPath,
                accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(helpers.getOptionalStringArg(args, "token")),
                args: runtimeArgs,
                useInorder,
                ...inspectionOptions,
                ...runtimeOptions,
            });
        (0, sourceCommandRuntime_1.emitTextOutputPayload)(helpers, outPath, result.urdf, result);
    },
    "urdf-to-usd": async (args, helpers) => {
        const directUrdfPath = helpers.getOptionalStringArg(args, "urdf");
        const sourcePath = helpers.getOptionalStringArg(args, "path");
        if ((directUrdfPath ? 1 : 0) + (sourcePath ? 1 : 0) !== 1) {
            helpers.fail("urdf-to-usd requires exactly one of --urdf or --path.");
        }
        const result = sourcePath
            ? await (0, urdfUsdNode_1.convertLocalSourcePathToUSD)({
                path: sourcePath,
                entryPath: helpers.getOptionalStringArg(args, "entry"),
                args: helpers.getKeyValueArg(args, "args", "arg"),
                useInorder: !Boolean(args.get("no-inorder")),
                ...(0, sourceCommandRuntime_1.getXacroRuntimeOptions)(args, helpers),
                outputPath: helpers.getOptionalStringArg(args, "out"),
                rootPath: helpers.getOptionalStringArg(args, "root"),
            })
            : await (0, urdfUsdNode_1.convertURDFPathToUSD)(directUrdfPath || "", {
                outputPath: helpers.getOptionalStringArg(args, "out"),
                rootPath: helpers.getOptionalStringArg(args, "root"),
            });
        (0, sourceCommandRuntime_1.emitJson)(result);
    },
};

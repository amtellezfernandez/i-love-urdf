"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGitHubRepositoryReference = exports.getXacroRuntimeOptions = exports.getRepositoryInspectionOptions = exports.emitTextOutputPayload = exports.emitJsonPayload = exports.emitJson = void 0;
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const emitJson = (value) => {
    console.log(JSON.stringify(value, null, 2));
};
exports.emitJson = emitJson;
const emitJsonPayload = (helpers, outPath, payload) => {
    const serialized = JSON.stringify(payload, null, 2);
    helpers.writeOutIfRequested(outPath, serialized);
    console.log(serialized);
};
exports.emitJsonPayload = emitJsonPayload;
const emitTextOutputPayload = (helpers, outPath, writtenContent, payload) => {
    helpers.writeOutIfRequested(outPath, writtenContent);
    (0, exports.emitJson)({ ...payload, outPath: outPath || null });
};
exports.emitTextOutputPayload = emitTextOutputPayload;
const getRepositoryInspectionOptions = (args, helpers) => ({
    maxCandidatesToInspect: helpers.getOptionalNumberArg(args, "max-candidates"),
    concurrency: helpers.getOptionalNumberArg(args, "concurrency"),
});
exports.getRepositoryInspectionOptions = getRepositoryInspectionOptions;
const getXacroRuntimeOptions = (args, helpers) => ({
    pythonExecutable: helpers.getOptionalStringArg(args, "python"),
    wheelPath: helpers.getOptionalStringArg(args, "wheel"),
});
exports.getXacroRuntimeOptions = getXacroRuntimeOptions;
const resolveGitHubRepositoryReference = (args, githubValue, helpers, pathArgName = "path") => {
    const parsed = (0, githubRepositoryInspection_1.parseGitHubRepositoryReference)(githubValue);
    if (!parsed) {
        helpers.fail("Invalid --github value. Expected owner/repo or a GitHub repository URL.");
    }
    const pathOverride = helpers.getOptionalStringArg(args, pathArgName);
    const refOverride = helpers.getOptionalStringArg(args, "ref");
    return {
        ...parsed,
        path: pathOverride ?? parsed.path,
        ref: refOverride ?? parsed.ref,
    };
};
exports.resolveGitHubRepositoryReference = resolveGitHubRepositoryReference;

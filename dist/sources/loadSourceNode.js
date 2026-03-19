"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSourceFromGitHub = exports.loadSourceFromPath = void 0;
const fs = require("node:fs/promises");
const path = require("node:path");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const repositoryUrdfDiscovery_1 = require("../repository/repositoryUrdfDiscovery");
const repositoryMeshResolution_1 = require("../repository/repositoryMeshResolution");
const xacroContract_1 = require("../xacro/xacroContract");
const xacroNode_1 = require("../xacro/xacroNode");
const isUrdfPath = (value) => value.toLowerCase().endsWith(".urdf");
const inferEntryFormat = (entryPath) => {
    const normalized = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(entryPath);
    if ((0, xacroContract_1.isXacroPath)(normalized))
        return "xacro";
    if (isUrdfPath(normalized))
        return "urdf";
    return null;
};
const resolveSelectedEntryPath = (requestedEntryPath, summary) => {
    const normalizedRequested = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(requestedEntryPath || "");
    if (normalizedRequested)
        return normalizedRequested;
    if (summary.primaryCandidatePath)
        return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(summary.primaryCandidatePath);
    throw new Error("No URDF or Xacro entrypoint was found. Pass --entry to choose one explicitly.");
};
const summarizeRepositoryCandidates = (files, candidateFilter) => {
    const candidates = (0, repositoryUrdfDiscovery_1.findRepositoryUrdfCandidates)(files).filter((candidate) => candidateFilter ? candidateFilter(candidate) : true);
    return {
        candidateCount: candidates.length,
        primaryCandidatePath: candidates[0]?.path ?? null,
    };
};
const buildResult = (params) => ({
    source: params.source,
    inspectedPath: params.inspectedPath,
    rootPath: params.rootPath,
    repositoryUrl: params.repositoryUrl,
    ref: params.ref,
    entryPath: params.entryPath,
    entryFormat: params.entryFormat,
    inspectionMode: params.entryFormat === "xacro" ? "xacro-source" : "urdf",
    urdf: params.urdf,
    runtime: params.runtime ?? null,
    candidateCount: params.candidateCount,
    primaryCandidatePath: params.primaryCandidatePath ?? null,
});
const loadSourceFromPath = async (options) => {
    const inspectedPath = path.resolve(options.path);
    const stats = await fs.stat(inspectedPath);
    if (stats.isFile()) {
        const entryFormat = inferEntryFormat(inspectedPath);
        if (!entryFormat) {
            throw new Error("Local file input must end in .urdf or .xacro.");
        }
        if (entryFormat === "urdf") {
            return buildResult({
                source: "local-file",
                inspectedPath,
                rootPath: path.dirname(inspectedPath),
                entryPath: path.basename(inspectedPath),
                entryFormat,
                urdf: await fs.readFile(inspectedPath, "utf8"),
            });
        }
        const result = await (0, xacroNode_1.expandLocalXacroToUrdf)({
            xacroPath: inspectedPath,
            rootPath: options.rootPath,
            args: options.args,
            useInorder: options.useInorder,
            pythonExecutable: options.pythonExecutable,
            wheelPath: options.wheelPath,
            helperScriptPath: options.helperScriptPath,
        });
        return buildResult({
            source: "local-file",
            inspectedPath,
            rootPath: result.rootPath,
            entryPath: result.xacroPath,
            entryFormat,
            urdf: result.urdf,
            runtime: result.runtime,
        });
    }
    if (!stats.isDirectory()) {
        throw new Error(`Unsupported local source path: ${inspectedPath}`);
    }
    const files = await (0, localRepositoryInspection_1.collectLocalRepositoryFiles)(inspectedPath);
    const summary = summarizeRepositoryCandidates(files, options.candidateFilter);
    const entryPath = resolveSelectedEntryPath(options.entryPath, summary);
    const entryFormat = inferEntryFormat(entryPath);
    if (!entryFormat) {
        throw new Error("Repository entrypoint must end in .urdf or .xacro.");
    }
    if (entryFormat === "urdf") {
        const absoluteUrdfPath = path.resolve(inspectedPath, entryPath);
        return buildResult({
            source: "local-repo",
            inspectedPath,
            rootPath: inspectedPath,
            entryPath,
            entryFormat,
            urdf: await fs.readFile(absoluteUrdfPath, "utf8"),
            candidateCount: summary.candidateCount,
            primaryCandidatePath: summary.primaryCandidatePath,
        });
    }
    const expanded = await (0, xacroNode_1.expandLocalXacroToUrdf)({
        xacroPath: path.resolve(inspectedPath, entryPath),
        rootPath: inspectedPath,
        args: options.args,
        useInorder: options.useInorder,
        pythonExecutable: options.pythonExecutable,
        wheelPath: options.wheelPath,
        helperScriptPath: options.helperScriptPath,
    });
    return buildResult({
        source: "local-repo",
        inspectedPath,
        rootPath: inspectedPath,
        entryPath,
        entryFormat,
        urdf: expanded.urdf,
        runtime: expanded.runtime,
        candidateCount: summary.candidateCount,
        primaryCandidatePath: summary.primaryCandidatePath,
    });
};
exports.loadSourceFromPath = loadSourceFromPath;
const loadSourceFromGitHub = async (options) => {
    const { ref, files } = await (0, githubRepositoryInspection_1.fetchGitHubRepositoryFiles)(options.reference, options.accessToken);
    const summary = summarizeRepositoryCandidates(files, options.candidateFilter);
    const entryPath = resolveSelectedEntryPath(options.entryPath, summary);
    const entryFormat = inferEntryFormat(entryPath);
    if (!entryFormat) {
        throw new Error("GitHub repository entrypoint must end in .urdf or .xacro.");
    }
    if (entryFormat === "urdf") {
        const targetFile = files.find((file) => file.type === "file" && (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path) === entryPath);
        if (!targetFile) {
            throw new Error(`GitHub file not found in repository tree: ${entryPath}`);
        }
        return buildResult({
            source: "github",
            inspectedPath: `https://github.com/${options.reference.owner}/${options.reference.repo}`,
            repositoryUrl: `https://github.com/${options.reference.owner}/${options.reference.repo}`,
            ref,
            entryPath,
            entryFormat,
            urdf: await (0, githubRepositoryInspection_1.fetchGitHubTextFile)(options.reference.owner, options.reference.repo, targetFile.path, targetFile.sha, options.accessToken),
            candidateCount: summary.candidateCount,
            primaryCandidatePath: summary.primaryCandidatePath,
        });
    }
    const expanded = await (0, xacroNode_1.expandFetchedGitHubRepositoryXacro)(options.reference, ref, files, {
        targetPath: entryPath,
        accessToken: options.accessToken,
        args: options.args,
        useInorder: options.useInorder,
        pythonExecutable: options.pythonExecutable,
        wheelPath: options.wheelPath,
        helperScriptPath: options.helperScriptPath,
    });
    return buildResult({
        source: "github",
        inspectedPath: expanded.repositoryUrl,
        repositoryUrl: expanded.repositoryUrl,
        ref: expanded.ref,
        entryPath: expanded.targetPath,
        entryFormat,
        urdf: expanded.urdf,
        runtime: expanded.runtime,
        candidateCount: summary.candidateCount,
        primaryCandidatePath: summary.primaryCandidatePath,
    });
};
exports.loadSourceFromGitHub = loadSourceFromGitHub;

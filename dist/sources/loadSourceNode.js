"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSourceFromGitHub = exports.loadSourceFromPath = void 0;
const fs = require("node:fs/promises");
const path = require("node:path");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const fixMissingMeshReferences_1 = require("../repository/fixMissingMeshReferences");
const repositoryPackageNames_1 = require("../repository/repositoryPackageNames");
const repositoryPathScope_1 = require("../repository/repositoryPathScope");
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
const buildScopedCandidateFilter = (scope, candidateFilter) => (candidate) => (0, repositoryPathScope_1.matchesRepositoryScope)(candidate.path, scope) && (candidateFilter ? candidateFilter(candidate) : true);
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
    meshReferenceCorrectionCount: params.meshReferenceCorrectionCount,
    meshReferenceUnresolvedCount: params.meshReferenceUnresolvedCount,
});
const summarizeRepositoryMeshRepairNeed = (urdf, entryPath, files, packageNameByPath) => {
    const repairPlan = (0, fixMissingMeshReferences_1.fixMissingMeshReferencesInRepository)(urdf, entryPath, files, {
        packageNameByPath,
        normalizeResolvableReferences: true,
    });
    return {
        meshReferenceCorrectionCount: repairPlan.corrections.length,
        meshReferenceUnresolvedCount: repairPlan.unresolved.length,
    };
};
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
    const localRepository = await (0, localRepositoryInspection_1.resolveLocalRepositoryReference)({ path: inspectedPath });
    const files = await (0, localRepositoryInspection_1.collectLocalRepositoryFiles)(localRepository.rootPath);
    const packageNameByPath = await (0, repositoryPackageNames_1.buildPackageNameByPathFromRepositoryFiles)(files, async (file) => fs.readFile(file.absolutePath, "utf8"));
    const scopedCandidateFilter = buildScopedCandidateFilter(localRepository.scope, options.candidateFilter);
    const summary = summarizeRepositoryCandidates(files, scopedCandidateFilter);
    const selectedEntryPath = resolveSelectedEntryPath((0, repositoryPathScope_1.resolveRepositoryScopedPathFromFiles)(files, localRepository.scope, options.entryPath) || undefined, summary);
    const entryFormat = inferEntryFormat(selectedEntryPath);
    if (!entryFormat) {
        throw new Error("Repository entrypoint must end in .urdf or .xacro.");
    }
    const { filePath: entryPath, absolutePath: absoluteEntryPath } = await (0, localRepositoryInspection_1.resolveLocalRepositoryFile)(localRepository.rootPath, selectedEntryPath, {
        outsideRoot: "Local repository entrypoint must stay inside the selected root path.",
        notFile: (absolutePath) => `Local repository entrypoint is not a file: ${absolutePath}`,
    });
    if (entryFormat === "urdf") {
        const urdf = await fs.readFile(absoluteEntryPath, "utf8");
        return buildResult({
            source: "local-repo",
            inspectedPath,
            rootPath: localRepository.rootPath,
            entryPath,
            entryFormat,
            urdf,
            candidateCount: summary.candidateCount,
            primaryCandidatePath: summary.primaryCandidatePath,
            ...summarizeRepositoryMeshRepairNeed(urdf, entryPath, files, packageNameByPath),
        });
    }
    const expanded = await (0, xacroNode_1.expandLocalXacroToUrdf)({
        xacroPath: absoluteEntryPath,
        rootPath: localRepository.rootPath,
        args: options.args,
        useInorder: options.useInorder,
        pythonExecutable: options.pythonExecutable,
        wheelPath: options.wheelPath,
        helperScriptPath: options.helperScriptPath,
    });
    return buildResult({
        source: "local-repo",
        inspectedPath,
        rootPath: localRepository.rootPath,
        entryPath,
        entryFormat,
        urdf: expanded.urdf,
        runtime: expanded.runtime,
        candidateCount: summary.candidateCount,
        primaryCandidatePath: summary.primaryCandidatePath,
        ...summarizeRepositoryMeshRepairNeed(expanded.urdf, entryPath, files, packageNameByPath),
    });
};
exports.loadSourceFromPath = loadSourceFromPath;
const loadSourceFromGitHub = async (options) => {
    const { ref, files } = await (0, githubRepositoryInspection_1.fetchGitHubRepositoryFiles)(options.reference, options.accessToken);
    const scope = (0, repositoryPathScope_1.resolveRepositoryScopeFromFiles)(files, options.reference.path);
    if (!scope) {
        throw new Error("GitHub repository path not found.");
    }
    const packageNameByPath = await (0, repositoryPackageNames_1.buildPackageNameByPathFromRepositoryFiles)(files, (file) => (0, githubRepositoryInspection_1.fetchGitHubTextFile)(options.reference.owner, options.reference.repo, file.path, file.sha, options.accessToken, ref, file.download_url));
    const summary = summarizeRepositoryCandidates(files, buildScopedCandidateFilter(scope, options.candidateFilter));
    const entryPath = resolveSelectedEntryPath((0, repositoryPathScope_1.resolveRepositoryScopedPathFromFiles)(files, scope, options.entryPath) || undefined, summary);
    const entryFormat = inferEntryFormat(entryPath);
    if (!entryFormat) {
        throw new Error("GitHub repository entrypoint must end in .urdf or .xacro.");
    }
    if (entryFormat === "urdf") {
        const targetFile = files.find((file) => file.type === "file" && (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path) === entryPath);
        if (!targetFile) {
            throw new Error(`GitHub file not found in repository tree: ${entryPath}`);
        }
        const urdf = await (0, githubRepositoryInspection_1.fetchGitHubTextFile)(options.reference.owner, options.reference.repo, targetFile.path, targetFile.sha, options.accessToken, ref, targetFile.download_url);
        return buildResult({
            source: "github",
            inspectedPath: `https://github.com/${options.reference.owner}/${options.reference.repo}`,
            repositoryUrl: `https://github.com/${options.reference.owner}/${options.reference.repo}`,
            ref,
            entryPath,
            entryFormat,
            urdf,
            candidateCount: summary.candidateCount,
            primaryCandidatePath: summary.primaryCandidatePath,
            ...summarizeRepositoryMeshRepairNeed(urdf, entryPath, files, packageNameByPath),
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
        ...summarizeRepositoryMeshRepairNeed(expanded.urdf, expanded.targetPath, files, packageNameByPath),
    });
};
exports.loadSourceFromGitHub = loadSourceFromGitHub;

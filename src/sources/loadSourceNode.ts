import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  fetchGitHubRepositoryFiles,
  fetchGitHubTextFile,
  type GitHubRepositoryReference,
} from "../repository/githubRepositoryInspection";
import {
  collectLocalRepositoryFiles,
  resolveLocalRepositoryFile,
  resolveLocalRepositoryReference,
  resolveLocalRepositoryScopedFile,
} from "../repository/localRepositoryInspection";
import { fixMissingMeshReferencesInRepository } from "../repository/fixMissingMeshReferences";
import { buildPackageNameByPathFromRepositoryFiles } from "../repository/repositoryPackageNames";
import {
  matchesRepositoryScope,
  resolveRepositoryScopeFromFiles,
  resolveRepositoryScopedPathFromFiles,
} from "../repository/repositoryPathScope";
import { type InspectRepositoryFilesOptions } from "../repository/repositoryInspection";
import { findRepositoryUrdfCandidates } from "../repository/repositoryUrdfDiscovery";
import { normalizeRepositoryPath } from "../repository/repositoryMeshResolution";
import { isXacroPath } from "../xacro/xacroContract";
import {
  expandFetchedGitHubRepositoryXacro,
  expandLocalXacroToUrdf,
  type XacroRuntimeName,
  type XacroRuntimeOptions,
} from "../xacro/xacroNode";

export type LoadSourceResult = {
  source: "local-file" | "local-repo" | "github";
  inspectedPath: string;
  rootPath?: string;
  repositoryUrl?: string;
  ref?: string;
  entryPath: string;
  entryFormat: "urdf" | "xacro";
  inspectionMode: "urdf" | "xacro-source";
  urdf: string;
  runtime: XacroRuntimeName | null;
  candidateCount?: number;
  primaryCandidatePath?: string | null;
  meshReferenceCorrectionCount?: number;
  meshReferenceUnresolvedCount?: number;
};

export type LoadSourcePathOptions = XacroRuntimeOptions &
  InspectRepositoryFilesOptions & {
    path: string;
    entryPath?: string;
    rootPath?: string;
    args?: Record<string, string>;
    useInorder?: boolean;
  };

export type LoadSourceGitHubOptions = XacroRuntimeOptions &
  InspectRepositoryFilesOptions & {
    reference: GitHubRepositoryReference;
    entryPath?: string;
    accessToken?: string;
    args?: Record<string, string>;
    useInorder?: boolean;
  };

const isUrdfPath = (value: string): boolean => value.toLowerCase().endsWith(".urdf");

const inferEntryFormat = (entryPath: string): "urdf" | "xacro" | null => {
  const normalized = normalizeRepositoryPath(entryPath);
  if (isXacroPath(normalized)) return "xacro";
  if (isUrdfPath(normalized)) return "urdf";
  return null;
};

const resolveSelectedEntryPath = (
  requestedEntryPath: string | undefined,
  summary: { primaryCandidatePath: string | null }
): string => {
  const normalizedRequested = normalizeRepositoryPath(requestedEntryPath || "");
  if (normalizedRequested) return normalizedRequested;
  if (summary.primaryCandidatePath) return normalizeRepositoryPath(summary.primaryCandidatePath);
  throw new Error("No URDF or Xacro entrypoint was found. Pass --entry to choose one explicitly.");
};

const summarizeRepositoryCandidates = <
  T extends {
    name: string;
    path: string;
    type: "file" | "dir";
  }
>(
  files: T[],
  candidateFilter?: InspectRepositoryFilesOptions["candidateFilter"]
): {
  candidateCount: number;
  primaryCandidatePath: string | null;
} => {
  const candidates = findRepositoryUrdfCandidates(files).filter((candidate) =>
    candidateFilter ? candidateFilter(candidate) : true
  );
  return {
    candidateCount: candidates.length,
    primaryCandidatePath: candidates[0]?.path ?? null,
  };
};

const buildScopedCandidateFilter = (
  scope: Parameters<typeof matchesRepositoryScope>[1],
  candidateFilter?: InspectRepositoryFilesOptions["candidateFilter"]
) => (candidate: Parameters<NonNullable<InspectRepositoryFilesOptions["candidateFilter"]>>[0]) =>
    matchesRepositoryScope(candidate.path, scope) && (candidateFilter ? candidateFilter(candidate) : true);

const buildResult = (params: {
  source: LoadSourceResult["source"];
  inspectedPath: string;
  rootPath?: string;
  repositoryUrl?: string;
  ref?: string;
  entryPath: string;
  entryFormat: LoadSourceResult["entryFormat"];
  urdf: string;
  runtime?: XacroRuntimeName | null;
  candidateCount?: number;
  primaryCandidatePath?: string | null;
  meshReferenceCorrectionCount?: number;
  meshReferenceUnresolvedCount?: number;
}): LoadSourceResult => ({
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

const summarizeRepositoryMeshRepairNeed = <
  T extends {
    path: string;
    type: "file" | "dir";
  },
>(
  urdf: string,
  entryPath: string,
  files: T[],
  packageNameByPath?: Parameters<typeof fixMissingMeshReferencesInRepository>[3]["packageNameByPath"]
): Pick<LoadSourceResult, "meshReferenceCorrectionCount" | "meshReferenceUnresolvedCount"> => {
  const repairPlan = fixMissingMeshReferencesInRepository(urdf, entryPath, files, {
    packageNameByPath,
    normalizeResolvableReferences: true,
  });
  return {
    meshReferenceCorrectionCount: repairPlan.corrections.length,
    meshReferenceUnresolvedCount: repairPlan.unresolved.length,
  };
};

export const loadSourceFromPath = async (
  options: LoadSourcePathOptions
): Promise<LoadSourceResult> => {
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

    const result = await expandLocalXacroToUrdf({
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

  const localRepository = await resolveLocalRepositoryReference({ path: inspectedPath });
  const files = await collectLocalRepositoryFiles(localRepository.rootPath);
  const packageNameByPath = await buildPackageNameByPathFromRepositoryFiles(
    files,
    async (file) => fs.readFile(file.absolutePath, "utf8")
  );
  const scopedCandidateFilter = buildScopedCandidateFilter(localRepository.scope, options.candidateFilter);
  const summary = summarizeRepositoryCandidates(files, scopedCandidateFilter);

  const selectedEntryPath = resolveSelectedEntryPath(
    resolveRepositoryScopedPathFromFiles(files, localRepository.scope, options.entryPath) || undefined,
    summary
  );
  const entryFormat = inferEntryFormat(selectedEntryPath);
  if (!entryFormat) {
    throw new Error("Repository entrypoint must end in .urdf or .xacro.");
  }

  const { filePath: entryPath, absolutePath: absoluteEntryPath } = await resolveLocalRepositoryFile(
    localRepository.rootPath,
    selectedEntryPath,
    {
      outsideRoot: "Local repository entrypoint must stay inside the selected root path.",
      notFile: (absolutePath) => `Local repository entrypoint is not a file: ${absolutePath}`,
    }
  );

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

  const expanded = await expandLocalXacroToUrdf({
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

export const loadSourceFromGitHub = async (
  options: LoadSourceGitHubOptions
): Promise<LoadSourceResult> => {
  const { ref, files } = await fetchGitHubRepositoryFiles(options.reference, options.accessToken);
  const scope = resolveRepositoryScopeFromFiles(files, options.reference.path);
  if (!scope) {
    throw new Error("GitHub repository path not found.");
  }
  const packageNameByPath = await buildPackageNameByPathFromRepositoryFiles(files, (file) =>
    fetchGitHubTextFile(
      options.reference.owner,
      options.reference.repo,
      file.path,
      file.sha,
      options.accessToken,
      ref,
      file.download_url
    )
  );
  const summary = summarizeRepositoryCandidates(
    files,
    buildScopedCandidateFilter(scope, options.candidateFilter)
  );

  const entryPath = resolveSelectedEntryPath(
    resolveRepositoryScopedPathFromFiles(files, scope, options.entryPath) || undefined,
    summary
  );
  const entryFormat = inferEntryFormat(entryPath);
  if (!entryFormat) {
    throw new Error("GitHub repository entrypoint must end in .urdf or .xacro.");
  }

  if (entryFormat === "urdf") {
    const targetFile = files.find(
      (file) => file.type === "file" && normalizeRepositoryPath(file.path) === entryPath
    );
    if (!targetFile) {
      throw new Error(`GitHub file not found in repository tree: ${entryPath}`);
    }

    const urdf = await fetchGitHubTextFile(
      options.reference.owner,
      options.reference.repo,
      targetFile.path,
      targetFile.sha,
      options.accessToken,
      ref,
      targetFile.download_url
    );
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

  const expanded = await expandFetchedGitHubRepositoryXacro(options.reference, ref, files, {
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

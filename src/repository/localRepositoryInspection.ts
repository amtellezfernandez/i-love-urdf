import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  fixMissingMeshReferencesInRepository,
  type FixMissingMeshReferencesOptions,
  type FixMissingMeshReferencesResult,
} from "./fixMissingMeshReferences";
import {
  inspectRepositoryFiles,
  type InspectRepositoryFilesOptions,
  type RepositoryInspectionSummary,
} from "./repositoryInspection";
import { buildPackageNameByPathFromRepositoryFiles } from "./repositoryPackageNames";
import { matchesRepositoryScope, type RepositoryScope } from "./repositoryPathScope";
import { normalizeRepositoryPath } from "./repositoryMeshResolution";

export type LocalRepositoryReference = {
  path: string;
};

export type LocalRepositoryFile = {
  name: string;
  path: string;
  type: "file" | "dir";
  absolutePath: string;
  size?: number;
};

export type InspectLocalRepositoryOptions = InspectRepositoryFilesOptions;

export type LocalRepositoryInspectionResult = RepositoryInspectionSummary & {
  source: "local";
  rootPath: string;
  inspectedPath: string;
};

export type RepairLocalRepositoryOptions = FixMissingMeshReferencesOptions & {
  urdfPath?: string;
};

export type LocalRepositoryMeshRepairResult = FixMissingMeshReferencesResult & {
  source: "local";
  rootPath: string;
  inspectedPath: string;
  urdfPath: string;
};

const LOCAL_REPOSITORY_SKIPPED_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
]);

const isSkippableWalkError = (error: unknown): boolean => {
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  return code === "EACCES" || code === "EPERM" || code === "ENOENT";
};

const readDirectoryEntries = async (
  absolutePath: string,
  { allowSkip = true }: { allowSkip?: boolean } = {}
) => {
  try {
    return await fs.readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    if (allowSkip && isSkippableWalkError(error)) {
      return null;
    }
    throw error;
  }
};

const readFileStats = async (
  absolutePath: string,
  { allowSkip = true }: { allowSkip?: boolean } = {}
) => {
  try {
    return await fs.stat(absolutePath);
  } catch (error) {
    if (allowSkip && isSkippableWalkError(error)) {
      return null;
    }
    throw error;
  }
};

const pathExists = async (absolutePath: string): Promise<boolean> => {
  try {
    await fs.access(absolutePath);
    return true;
  } catch (error) {
    if (isSkippableWalkError(error)) {
      return false;
    }
    throw error;
  }
};

const findNearestLocalRepositoryRoot = async (startPath: string): Promise<string> => {
  let currentPath = path.resolve(startPath);

  while (true) {
    if (await pathExists(path.join(currentPath, "package.xml"))) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  currentPath = path.resolve(startPath);
  while (true) {
    if (await pathExists(path.join(currentPath, ".git"))) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  return path.resolve(startPath);
};

export const resolveLocalRepositoryScopedFile = async (
  rootPath: string,
  scopedBasePath: string,
  requestedPath: string,
  messages: {
    outsideRoot: string;
    notFile: (absolutePath: string) => string;
  }
): Promise<{
  filePath: string;
  absolutePath: string;
}> => {
  const normalizedRequestedPath = normalizeRepositoryPath(requestedPath);
  if (!normalizedRequestedPath) {
    throw new Error(messages.outsideRoot);
  }

  const absoluteRequestedPath = path.resolve(scopedBasePath, requestedPath);
  const [realRootPath, realTargetPath] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(absoluteRequestedPath),
  ]);
  const canonicalRelativePath = normalizeRepositoryPath(path.relative(realRootPath, realTargetPath));
  if (!canonicalRelativePath || canonicalRelativePath.startsWith("..")) {
    throw new Error(messages.outsideRoot);
  }

  const stats = await readFileStats(realTargetPath, { allowSkip: false });
  if (!stats.isFile()) {
    throw new Error(messages.notFile(realTargetPath));
  }

  return {
    filePath: canonicalRelativePath,
    absolutePath: realTargetPath,
  };
};

export const resolveLocalRepositoryReference = async (
  reference: LocalRepositoryReference
) => {
  const inspectedPath = path.resolve(reference.path);
  const stats = await readFileStats(inspectedPath, { allowSkip: false });
  const scopedBasePath = stats.isDirectory() ? inspectedPath : path.dirname(inspectedPath);
  const rootPath = await findNearestLocalRepositoryRoot(scopedBasePath);
  const scopePath = normalizeRepositoryPath(path.relative(rootPath, inspectedPath));
  const scope: RepositoryScope = stats.isDirectory()
    ? scopePath
      ? {
          kind: "dir",
          path: scopePath,
        }
      : {
          kind: "root",
          path: "",
        }
    : {
        kind: "file",
        path: scopePath || path.basename(inspectedPath),
      };
  return { inspectedPath, scopedBasePath, scope, stats, rootPath };
};

export const resolveLocalRepositoryFile = async (
  rootPath: string,
  requestedPath: string,
  messages: {
    outsideRoot: string;
    notFile: (absolutePath: string) => string;
  }
): Promise<{
  filePath: string;
  absolutePath: string;
}> =>
  resolveLocalRepositoryScopedFile(rootPath, rootPath, requestedPath, messages);

const walkLocalRepository = async (
  absoluteRootPath: string,
  currentAbsolutePath: string,
  entries: LocalRepositoryFile[]
): Promise<void> => {
  const dirEntries = await readDirectoryEntries(currentAbsolutePath, {
    allowSkip: currentAbsolutePath !== absoluteRootPath,
  });

  if (!dirEntries) {
    return;
  }

  for (const dirEntry of dirEntries) {
    const absolutePath = path.join(currentAbsolutePath, dirEntry.name);
    const relativePath = normalizeRepositoryPath(path.relative(absoluteRootPath, absolutePath));

    if (dirEntry.isDirectory()) {
      if (LOCAL_REPOSITORY_SKIPPED_DIRS.has(dirEntry.name)) {
        continue;
      }
      entries.push({
        name: dirEntry.name,
        path: relativePath,
        type: "dir",
        absolutePath,
      });
      await walkLocalRepository(absoluteRootPath, absolutePath, entries);
      continue;
    }

    if (!dirEntry.isFile()) {
      continue;
    }

    const stats = await readFileStats(absolutePath);

    if (!stats) {
      continue;
    }

    entries.push({
      name: dirEntry.name,
      path: relativePath,
      type: "file",
      absolutePath,
      size: stats.size,
    });
  }
};

export const collectLocalRepositoryFiles = async (
  absoluteRootPath: string
): Promise<LocalRepositoryFile[]> => {
  const entries: LocalRepositoryFile[] = [];
  await walkLocalRepository(absoluteRootPath, absoluteRootPath, entries);
  return entries;
};

const resolveLocalRepositoryTarget = async (
  reference: LocalRepositoryReference,
  requestedUrdfPath?: string
): Promise<{
  files: LocalRepositoryFile[];
  rootPath: string;
  inspectedPath: string;
  urdfPath: string;
  urdfContent: string;
}> => {
  const { inspectedPath, scopedBasePath, scope, stats, rootPath } =
    await resolveLocalRepositoryReference(reference);

  const { filePath: normalizedUrdfPath, absolutePath: absoluteUrdfPath } = requestedUrdfPath
    ? await resolveLocalRepositoryScopedFile(rootPath, scopedBasePath, requestedUrdfPath, {
        outsideRoot: "Target URDF must stay inside the local repository root.",
        notFile: (absolutePath) => `Local repository target is not a file: ${absolutePath}`,
      })
    : await (() => {
        if (stats.isDirectory()) {
          throw new Error("Local repository repair requires --urdf when --local points to a directory.");
        }
        if (scope.kind !== "file") {
          throw new Error("Local repository repair could not resolve the selected URDF file.");
        }
        return Promise.resolve({
          filePath: scope.path,
          absolutePath: inspectedPath,
        });
      })();

  const [files, urdfContent] = await Promise.all([
    collectLocalRepositoryFiles(rootPath),
    fs.readFile(absoluteUrdfPath, "utf8"),
  ]);

  return {
    files,
    rootPath,
    inspectedPath,
    urdfPath: normalizedUrdfPath,
    urdfContent,
  };
};

export const inspectLocalRepositoryUrdfs = async (
  reference: LocalRepositoryReference,
  options: InspectLocalRepositoryOptions = {}
): Promise<LocalRepositoryInspectionResult> => {
  const { inspectedPath, scope, rootPath } = await resolveLocalRepositoryReference(reference);

  const files = await collectLocalRepositoryFiles(rootPath);
  const packageNameByPath = await buildPackageNameByPathFromRepositoryFiles(
    files,
    async (file) => fs.readFile(file.absolutePath, "utf8")
  );
  const summary = await inspectRepositoryFiles(
    files,
    async (_candidate, file) => fs.readFile(file.absolutePath, "utf8"),
    {
      ...options,
      packageNameByPath,
      candidateFilter: (candidate) => {
        const matchesLocalTarget = matchesRepositoryScope(candidate.path, scope);
        const matchesCallerFilter = options.candidateFilter ? options.candidateFilter(candidate) : true;
        return matchesLocalTarget && matchesCallerFilter;
      },
    }
  );

  return {
    source: "local",
    rootPath,
    inspectedPath,
    ...summary,
  };
};

export const repairLocalRepositoryMeshReferences = async (
  reference: LocalRepositoryReference,
  options: RepairLocalRepositoryOptions = {}
): Promise<LocalRepositoryMeshRepairResult> => {
  const { files, rootPath, inspectedPath, urdfPath, urdfContent } =
    await resolveLocalRepositoryTarget(reference, options.urdfPath);
  const packageNameByPath = await buildPackageNameByPathFromRepositoryFiles(
    files,
    async (file) => fs.readFile(file.absolutePath, "utf8")
  );
  const result = fixMissingMeshReferencesInRepository(urdfContent, urdfPath, files, {
    ...options,
    packageNameByPath,
    normalizeResolvableReferences: options.normalizeResolvableReferences ?? true,
  });

  return {
    source: "local",
    rootPath,
    inspectedPath,
    urdfPath,
    ...result,
  };
};

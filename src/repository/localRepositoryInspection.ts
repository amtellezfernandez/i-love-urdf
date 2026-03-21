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

const resolveLocalRepositoryReference = async (
  reference: LocalRepositoryReference
) => {
  const inspectedPath = path.resolve(reference.path);
  const stats = await readFileStats(inspectedPath, { allowSkip: false });
  const rootPath = stats.isDirectory() ? inspectedPath : path.dirname(inspectedPath);
  return { inspectedPath, stats, rootPath };
};

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
  const { inspectedPath, stats, rootPath } = await resolveLocalRepositoryReference(reference);

  const absoluteUrdfPath = stats.isDirectory()
    ? (() => {
        if (!requestedUrdfPath) {
          throw new Error("Local repository repair requires --urdf when --local points to a directory.");
        }
        return path.resolve(rootPath, requestedUrdfPath);
      })()
    : inspectedPath;

  const normalizedUrdfPath = normalizeRepositoryPath(path.relative(rootPath, absoluteUrdfPath));
  if (!normalizedUrdfPath || normalizedUrdfPath.startsWith("..")) {
    throw new Error("Target URDF must stay inside the local repository root.");
  }

  const urdfStats = await readFileStats(absoluteUrdfPath, { allowSkip: false });
  if (!urdfStats.isFile()) {
    throw new Error(`Local repository target is not a file: ${absoluteUrdfPath}`);
  }

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
  const { inspectedPath, stats, rootPath } = await resolveLocalRepositoryReference(reference);
  const candidateFilter =
    stats.isFile()
      ? (candidatePath: string) =>
          normalizeRepositoryPath(candidatePath) ===
          normalizeRepositoryPath(path.relative(rootPath, inspectedPath))
      : null;

  const files = await collectLocalRepositoryFiles(rootPath);
  const summary = await inspectRepositoryFiles(
    files,
    async (_candidate, file) => fs.readFile(file.absolutePath, "utf8"),
    {
      ...options,
      candidateFilter: (candidate) => {
        const matchesLocalTarget = candidateFilter ? candidateFilter(candidate.path) : true;
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
  const result = fixMissingMeshReferencesInRepository(urdfContent, urdfPath, files, options);

  return {
    source: "local",
    rootPath,
    inspectedPath,
    urdfPath,
    ...result,
  };
};

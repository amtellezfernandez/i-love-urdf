import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  inspectRepositoryFiles,
  type InspectRepositoryFilesOptions,
  type RepositoryCandidateInspection,
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

const walkLocalRepository = async (
  absoluteRootPath: string,
  currentAbsolutePath: string,
  entries: LocalRepositoryFile[]
): Promise<void> => {
  const dirEntries = await fs.readdir(currentAbsolutePath, { withFileTypes: true });

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

    const stats = await fs.stat(absolutePath);
    entries.push({
      name: dirEntry.name,
      path: relativePath,
      type: "file",
      absolutePath,
      size: stats.size,
    });
  }
};

const collectLocalRepositoryFiles = async (absoluteRootPath: string): Promise<LocalRepositoryFile[]> => {
  const entries: LocalRepositoryFile[] = [];
  await walkLocalRepository(absoluteRootPath, absoluteRootPath, entries);
  return entries;
};

export const inspectLocalRepositoryUrdfs = async (
  reference: LocalRepositoryReference,
  options: InspectLocalRepositoryOptions = {}
): Promise<LocalRepositoryInspectionResult> => {
  const inspectedPath = path.resolve(reference.path);
  const stats = await fs.stat(inspectedPath);

  const absoluteRootPath = stats.isDirectory() ? inspectedPath : path.dirname(inspectedPath);
  const candidateFilter =
    stats.isFile()
      ? (candidatePath: string) =>
          normalizeRepositoryPath(candidatePath) ===
          normalizeRepositoryPath(path.relative(absoluteRootPath, inspectedPath))
      : null;

  const files = await collectLocalRepositoryFiles(absoluteRootPath);
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
    rootPath: absoluteRootPath,
    inspectedPath,
    ...summary,
  };
};

import {
  buildPackageRootsFromRepositoryFiles,
  resolveRepositoryMeshReferences,
} from "./repositoryMeshResolution";
import {
  collectMeshReferencedPackageNamesFromUrdf,
  collectPackageNamesFromText,
  detectUnsupportedMeshFormats,
  extractXacroArgumentDefinitions,
  extractMeshReferencesFromUrdf,
  findRepositoryUrdfCandidates,
  hasRenderableUrdfGeometry,
  type RepositoryNamedFileEntry,
  type RepositoryUrdfCandidate,
  type XacroArgumentDefinition,
} from "./repositoryUrdfDiscovery";
import { extractExtension, isSupportedMeshExtension } from "../mesh/meshFormats";
import { normalizeMeshPathForMatch, parseMeshReference } from "../mesh/meshPaths";

export type InspectableRepositoryFile = RepositoryNamedFileEntry;

export type RepositoryCandidateInspection = RepositoryUrdfCandidate & {
  inspectionMode: "urdf" | "xacro-source";
  hasRenderableGeometry?: boolean;
  meshReferenceCount?: number;
  unresolvedMeshReferenceCount?: number;
  referencedPackages: string[];
  xacroArgs?: XacroArgumentDefinition[];
};

export type RepositoryInspectionSummary = {
  totalEntries: number;
  totalFiles: number;
  candidateCount: number;
  inspectedCandidateCount: number;
  primaryCandidatePath: string | null;
  candidates: RepositoryCandidateInspection[];
};

export type InspectRepositoryCandidatesOptions = {
  maxCandidatesToInspect?: number;
  concurrency?: number;
};

export type InspectRepositoryFilesOptions = InspectRepositoryCandidatesOptions & {
  candidateFilter?: (candidate: RepositoryUrdfCandidate) => boolean;
};

type RepositoryTextLoader<T extends InspectableRepositoryFile> = (
  candidate: RepositoryUrdfCandidate,
  file: T
) => Promise<string>;

const toBaseInspection = (candidate: RepositoryUrdfCandidate): RepositoryCandidateInspection => ({
  ...candidate,
  inspectionMode: candidate.isXacro ? "xacro-source" : "urdf",
  referencedPackages: [],
});

const inspectRepositoryCandidate = async <T extends InspectableRepositoryFile>(
  candidate: RepositoryUrdfCandidate,
  files: T[],
  readText: RepositoryTextLoader<T>
): Promise<RepositoryCandidateInspection> => {
  const file = files.find((entry) => entry.type === "file" && entry.path === candidate.path);
  const baseInspection = toBaseInspection(candidate);
  if (!file) {
    return baseInspection;
  }

  const text = await readText(candidate, file);
  const referencedPackages = Array.from(
    new Set([
      ...collectPackageNamesFromText(text),
      ...(candidate.isXacro ? [] : collectMeshReferencedPackageNamesFromUrdf(text)),
    ])
  ).sort();

  if (candidate.isXacro) {
    const xacroArgs = extractXacroArgumentDefinitions(text);
    return {
      ...baseInspection,
      referencedPackages,
      xacroArgs,
    };
  }

  const packageRoots = buildPackageRootsFromRepositoryFiles(files);
  const meshReferences = extractMeshReferencesFromUrdf(text);
  const { matchByReference } = resolveRepositoryMeshReferences(candidate.path, text, files, {
    packageRoots,
  });
  const unmatchedMeshReferences = meshReferences.filter((meshRef) => {
    const refInfo = parseMeshReference(meshRef);
    const normalized = normalizeMeshPathForMatch(refInfo.path || refInfo.raw);
    const ext = extractExtension(normalized);
    return Boolean(ext && isSupportedMeshExtension(ext) && !matchByReference.has(meshRef));
  });
  const unsupported = detectUnsupportedMeshFormats(text);

  return {
    ...baseInspection,
    referencedPackages,
    hasRenderableGeometry: hasRenderableUrdfGeometry(text),
    meshReferenceCount: meshReferences.length,
    hasUnsupportedFormats: unsupported.hasUnsupported,
    unsupportedFormats: unsupported.hasUnsupported ? unsupported.formats : undefined,
    unmatchedMeshReferences: unmatchedMeshReferences.length > 0 ? unmatchedMeshReferences : undefined,
    unresolvedMeshReferenceCount: unmatchedMeshReferences.length,
  };
};

export const inspectRepositoryCandidates = async <T extends InspectableRepositoryFile>(
  candidates: RepositoryUrdfCandidate[],
  files: T[],
  readText: RepositoryTextLoader<T>,
  options: InspectRepositoryCandidatesOptions = {}
): Promise<RepositoryCandidateInspection[]> => {
  const maxCandidatesToInspect = Math.max(
    0,
    Number(options.maxCandidatesToInspect ?? 12) || 12
  );
  const concurrency = Math.max(1, Number(options.concurrency ?? 4) || 4);
  const candidatesToInspect =
    maxCandidatesToInspect > 0 ? candidates.slice(0, maxCandidatesToInspect) : [];
  const untouchedCandidates: RepositoryCandidateInspection[] = candidates
    .slice(candidatesToInspect.length)
    .map((candidate) => toBaseInspection(candidate));
  const inspected = new Array<RepositoryCandidateInspection>(candidatesToInspect.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, candidatesToInspect.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= candidatesToInspect.length) return;
        inspected[index] = await inspectRepositoryCandidate(
          candidatesToInspect[index],
          files,
          readText
        );
      }
    }
  );

  await Promise.all(workers);

  return [...inspected, ...untouchedCandidates];
};

export const inspectRepositoryFiles = async <T extends InspectableRepositoryFile>(
  files: T[],
  readText: RepositoryTextLoader<T>,
  options: InspectRepositoryFilesOptions = {}
): Promise<RepositoryInspectionSummary> => {
  const totalEntries = files.length;
  const totalFiles = files.filter((file) => file.type === "file").length;
  const candidates = findRepositoryUrdfCandidates(files).filter((candidate) =>
    options.candidateFilter ? options.candidateFilter(candidate) : true
  );
  const inspectedCandidates = await inspectRepositoryCandidates(candidates, files, readText, {
    maxCandidatesToInspect: options.maxCandidatesToInspect,
    concurrency: options.concurrency,
  });
  const maxCandidatesToInspect = Math.max(
    0,
    Number(options.maxCandidatesToInspect ?? 12) || 12
  );

  return {
    totalEntries,
    totalFiles,
    candidateCount: candidates.length,
    inspectedCandidateCount: Math.min(candidates.length, maxCandidatesToInspect),
    primaryCandidatePath: candidates[0]?.path ?? null,
    candidates: inspectedCandidates,
  };
};

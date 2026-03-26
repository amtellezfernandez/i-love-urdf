import { type PackageNameByPath } from "./repositoryMeshResolution";
import { type RepositoryNamedFileEntry, type RepositoryUrdfCandidate, type XacroArgumentDefinition } from "./repositoryUrdfDiscovery";
export type InspectableRepositoryFile = RepositoryNamedFileEntry;
export type RepositoryCandidateInspection = RepositoryUrdfCandidate & {
    inspectionMode: "urdf" | "xacro-source";
    hasRenderableGeometry?: boolean;
    meshReferenceCount?: number;
    unresolvedMeshReferenceCount?: number;
    normalizableMeshReferenceCount?: number;
    referencedPackages: string[];
    xacroArgs?: XacroArgumentDefinition[];
};
export type RepositoryInspectionSummary = {
    totalEntries: number;
    totalFiles: number;
    totalBytes?: number;
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
    packageNameByPath?: PackageNameByPath;
};
type RepositoryTextLoader<T extends InspectableRepositoryFile> = (candidate: RepositoryUrdfCandidate, file: T) => Promise<string>;
export declare const inspectRepositoryCandidates: <T extends InspectableRepositoryFile>(candidates: RepositoryUrdfCandidate[], files: T[], readText: RepositoryTextLoader<T>, options?: InspectRepositoryCandidatesOptions & {
    packageNameByPath?: PackageNameByPath;
}) => Promise<RepositoryCandidateInspection[]>;
export declare const inspectRepositoryFiles: <T extends InspectableRepositoryFile>(files: T[], readText: RepositoryTextLoader<T>, options?: InspectRepositoryFilesOptions) => Promise<RepositoryInspectionSummary>;
export {};

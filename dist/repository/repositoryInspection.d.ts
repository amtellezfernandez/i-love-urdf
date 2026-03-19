import { type RepositoryNamedFileEntry, type RepositoryUrdfCandidate } from "./repositoryUrdfDiscovery";
export type InspectableRepositoryFile = RepositoryNamedFileEntry;
export type RepositoryCandidateInspection = RepositoryUrdfCandidate & {
    inspectionMode: "urdf" | "xacro-source";
    hasRenderableGeometry?: boolean;
    meshReferenceCount?: number;
    unresolvedMeshReferenceCount?: number;
    referencedPackages: string[];
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
type RepositoryTextLoader<T extends InspectableRepositoryFile> = (candidate: RepositoryUrdfCandidate, file: T) => Promise<string>;
export declare const inspectRepositoryCandidates: <T extends InspectableRepositoryFile>(candidates: RepositoryUrdfCandidate[], files: T[], readText: RepositoryTextLoader<T>, options?: InspectRepositoryCandidatesOptions) => Promise<RepositoryCandidateInspection[]>;
export declare const inspectRepositoryFiles: <T extends InspectableRepositoryFile>(files: T[], readText: RepositoryTextLoader<T>, options?: InspectRepositoryFilesOptions) => Promise<RepositoryInspectionSummary>;
export {};

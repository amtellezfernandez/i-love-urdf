import { type FixMissingMeshReferencesOptions, type FixMissingMeshReferencesResult } from "./fixMissingMeshReferences";
import { type InspectRepositoryFilesOptions, type RepositoryInspectionSummary } from "./repositoryInspection";
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
export declare const collectLocalRepositoryFiles: (absoluteRootPath: string) => Promise<LocalRepositoryFile[]>;
export declare const inspectLocalRepositoryUrdfs: (reference: LocalRepositoryReference, options?: InspectLocalRepositoryOptions) => Promise<LocalRepositoryInspectionResult>;
export declare const repairLocalRepositoryMeshReferences: (reference: LocalRepositoryReference, options?: RepairLocalRepositoryOptions) => Promise<LocalRepositoryMeshRepairResult>;

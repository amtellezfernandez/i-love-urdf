import { type RepositoryFileEntry } from "./repositoryMeshResolution";
export type MeshReferenceCorrection = {
    original: string;
    corrected: string;
    linkName?: string;
    element?: "visual" | "collision" | "unknown";
    reason: string;
};
export type FixMissingMeshReferencesResult = {
    success: boolean;
    content: string;
    corrections: MeshReferenceCorrection[];
    unresolved: string[];
    error?: string;
};
export type FixMissingMeshReferencesOptions = {
    packageRoots?: Record<string, string[]>;
};
export declare const fixMissingMeshReferencesInRepository: <T extends RepositoryFileEntry>(urdfContent: string, urdfPath: string, files: T[], options?: FixMissingMeshReferencesOptions) => FixMissingMeshReferencesResult;

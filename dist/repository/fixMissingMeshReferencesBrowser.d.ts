import type { PackageRootMap } from "../mesh/meshResolverBrowser";
import { type FixMissingMeshReferencesResult, type MeshReferenceCorrection } from "./fixMissingMeshReferences";
export type { FixMissingMeshReferencesResult, MeshReferenceCorrection };
export type FixMissingMeshReferencesBrowserOptions = {
    basePath?: string;
    packageRoots?: PackageRootMap;
};
export declare const fixMissingMeshReferences: (urdfContent: string, meshFiles: Record<string, Blob> | undefined, options?: FixMissingMeshReferencesBrowserOptions) => FixMissingMeshReferencesResult;

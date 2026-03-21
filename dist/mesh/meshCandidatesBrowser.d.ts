import { type MeshBlobMap, type PackageRootMap } from "./meshResolverBrowser";
export type ResolvedMeshCandidate = {
    ref: string;
    resolvedPath: string;
    blob: Blob;
};
export declare const resolveMeshCandidates: (params: {
    ref: string;
    meshFiles: MeshBlobMap;
    urdfBasePath?: string;
    packageRoots?: PackageRootMap;
}) => ResolvedMeshCandidate[];

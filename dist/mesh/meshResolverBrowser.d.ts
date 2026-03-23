export type MeshBlobMap = Record<string, Blob>;
export type PackageRootMap = Record<string, string[]>;
export type ResolveMeshBlobOptions = {
    basePath?: string;
    allowSchemeStrip?: boolean;
    allowDecode?: boolean;
    allowFilenameFallback?: boolean;
};
export type ResolvedMeshBlob = {
    path: string;
    blob: Blob;
};
export declare const buildPackageRootsFromMeshBlobMap: (meshFiles: MeshBlobMap) => PackageRootMap;
export declare const resolveMeshBlob: (rawPath: string, meshFiles: MeshBlobMap | undefined, options?: ResolveMeshBlobOptions) => ResolvedMeshBlob | null;
export declare const resolveMeshBlobFromReference: (meshRef: string, meshFiles: MeshBlobMap | undefined, basePath?: string, packageRoots?: PackageRootMap) => ResolvedMeshBlob | null;
export declare const resolveMeshResourceBlob: (uri: string, meshFiles: MeshBlobMap | undefined, basePath: string | undefined) => ResolvedMeshBlob | null;
export declare const stripMeshSchemes: (value: string) => string;

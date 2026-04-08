type BundleMeshAssetsOptions = {
    urdfPath: string;
    urdfContent: string;
    outPath: string;
    extraSearchRoots?: string[];
};
type BundledMeshAsset = {
    original: string;
    rewritten: string;
    sourcePath: string;
    targetPath: string;
};
export type BundleMeshAssetsResult = {
    success: boolean;
    content: string;
    outPath: string;
    assetsRoot: string;
    copiedFiles: number;
    bundled: BundledMeshAsset[];
    unresolved: string[];
    error?: string;
};
export declare const bundleMeshAssetsForUrdfFile: ({ urdfPath, urdfContent, outPath, extraSearchRoots, }: BundleMeshAssetsOptions) => BundleMeshAssetsResult;
export {};

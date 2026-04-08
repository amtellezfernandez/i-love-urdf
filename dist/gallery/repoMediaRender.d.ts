export type RepoMediaRenderAssetKind = "image" | "video";
export type RepoMediaRenderSource = {
    kind: "github";
    githubUrl: string;
    sourcePath?: string;
    ref?: string;
} | {
    kind: "local";
    localPath: string;
};
export type RepoMediaRenderItem = {
    candidatePath: string;
    thumbnailPath: string;
    videoPath: string;
};
export type RepoMediaRenderResult = {
    outputRoot: string;
    items: RepoMediaRenderItem[];
};
type GalleryRenderStateSnapshot = {
    phase?: string;
    ready?: boolean;
    cameraApplied?: boolean;
    error?: string | null;
};
export declare const isThumbnailRenderReady: (input: {
    renderState?: GalleryRenderStateSnapshot | null;
    thumbError?: string | null;
    readyAttribute?: string | null;
}) => boolean;
export declare const renderRepoMediaBatch: (source: RepoMediaRenderSource, appUrl: string, outputRoot: string, candidatePaths: readonly string[], assetKinds: readonly RepoMediaRenderAssetKind[]) => Promise<RepoMediaRenderResult>;
export {};

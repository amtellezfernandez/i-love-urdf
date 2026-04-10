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
export declare const isMissingThumbnailTargetError: (error: unknown) => boolean;
export declare const buildRenderTargetCandidates: (source: RepoMediaRenderSource, candidatePath: string) => string[];
export declare const selectResolvedRenderTargetPath: (source: RepoMediaRenderSource, requestedPath: string, inspectedCandidatePaths: readonly string[]) => string | null;
export declare const isThumbnailRenderReady: (input: {
    renderState?: GalleryRenderStateSnapshot | null;
    thumbError?: string | null;
    readyAttribute?: string | null;
}) => boolean;
export declare const resolveRenderableTargetPath: (source: RepoMediaRenderSource, candidatePath: string, attemptLoad: (targetPath: string) => Promise<void>) => Promise<string>;
export declare const renderRepoMediaBatch: (source: RepoMediaRenderSource, appUrl: string, outputRoot: string, candidatePaths: readonly string[], assetKinds: readonly RepoMediaRenderAssetKind[]) => Promise<RepoMediaRenderResult>;
export {};

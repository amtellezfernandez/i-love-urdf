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
export declare const renderRepoMediaBatch: (source: RepoMediaRenderSource, appUrl: string, outputRoot: string, candidatePaths: readonly string[], assetKinds: readonly RepoMediaRenderAssetKind[]) => Promise<RepoMediaRenderResult>;

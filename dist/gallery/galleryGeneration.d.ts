import { type IluSharedLoadedSource } from "../session/sharedSession";
import { StudioThumbnailClient } from "./studioThumbnailNode";
export type GalleryRepoSource = {
    kind: "github";
    githubRef: string;
    sourceLabel: string;
} | {
    kind: "local";
    localPath: string;
    sourceLabel: string;
};
export type GalleryCurrentSource = {
    kind: "current";
    sourceLabel: string;
    urdfPath: string;
    urdfContent: string;
    loadedSource: IluSharedLoadedSource | null;
};
export type GalleryBatchCandidate = {
    path: string;
    inspectionMode?: "urdf" | "xacro-source";
    unresolvedMeshReferenceCount?: number;
    xacroArgs?: Array<{
        name: string;
        isRequired?: boolean;
    }>;
};
export type GalleryBatchMode = "gallery" | "repo-fixes";
export type GalleryItemResult = {
    candidatePath: string;
    status: "generated" | "generated-with-fixes" | "needs-review" | "skipped";
    outputDir: string;
    workingUrdfPath: string | null;
    cardPath: string | null;
    thumbnailPath: string | null;
    reviewUrl: string | null;
    appliedFixes: string[];
    attentionLines: string[];
    skippedReason?: string;
};
export type GalleryBatchResult = {
    sourceLabel: string;
    outputRoot: string;
    robotCount: number;
    generatedCount: number;
    generatedWithFixesCount: number;
    needsReviewCount: number;
    skippedCount: number;
    thumbnailCount: number;
    thumbnailSkippedCount: number;
    sharedFixGroups: Array<{
        label: string;
        count: number;
    }>;
    items: GalleryItemResult[];
};
type GalleryBatchOptions = {
    mode: GalleryBatchMode;
    outputRoot?: string;
    thumbnailClient?: StudioThumbnailClient | null;
};
export declare const runGalleryBatchForRepo: (source: GalleryRepoSource, candidates: readonly GalleryBatchCandidate[], options: GalleryBatchOptions) => Promise<GalleryBatchResult>;
export declare const runGalleryForCurrentUrdf: (source: GalleryCurrentSource, outputRoot?: string) => Promise<GalleryItemResult>;
export {};

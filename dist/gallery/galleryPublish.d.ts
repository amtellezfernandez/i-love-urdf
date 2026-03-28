export type GalleryPublishRepoMetadata = {
    org?: string;
    summary?: string;
    demo?: string;
    tags?: string[];
    license?: string;
    authorWebsite?: string;
    authorX?: string;
    authorLinkedin?: string;
    authorGithub?: string;
    contact?: string;
    extra?: string;
    hfDatasets?: string[];
};
export type GalleryPublishSpec = {
    jobId: string;
    source: {
        owner: string;
        repo: string;
        path?: string | null;
        branch?: string | null;
    };
    repoMetadata: GalleryPublishRepoMetadata;
    items: Array<{
        id: string;
        title: string;
    }>;
    manifestPath: string;
};
export type GalleryPublishDraftFile = {
    path: string;
    content: string;
    encoding: "utf-8" | "base64";
    mediaType?: string;
};
export type GalleryPublishDraft = {
    title: string;
    body: string;
    branchName: string;
    repoSlug: string;
    files: GalleryPublishDraftFile[];
};
export declare const buildGalleryPublishDraft: (spec: GalleryPublishSpec) => Promise<GalleryPublishDraft>;

export declare const ILU_SHARED_SESSION_SCHEMA: "ilu-shared-session";
export declare const ILU_SHARED_SESSION_SCHEMA_VERSION: 1;
export declare const ILU_SHARED_SESSION_SOURCE_KINDS: readonly ["local-file", "local-repo", "github"];
export type IluSharedLoadedSourceKind = (typeof ILU_SHARED_SESSION_SOURCE_KINDS)[number];
export type IluSharedLoadedSource = {
    source: IluSharedLoadedSourceKind;
    urdfPath: string;
    localPath?: string;
    extractedArchivePath?: string;
    githubRef?: string;
    githubRevision?: string;
    repositoryUrdfPath?: string;
    meshReferenceCorrectionCount?: number;
    meshReferenceUnresolvedCount?: number;
};
export type IluSharedSessionGitHubSource = {
    owner: string;
    repo: string;
    ref?: string;
    repositoryUrl: string;
};
export type IluSharedSessionSnapshot = {
    schema: typeof ILU_SHARED_SESSION_SCHEMA;
    schemaVersion: typeof ILU_SHARED_SESSION_SCHEMA_VERSION;
    sessionId: string;
    createdAt: string;
    updatedAt: string;
    workingUrdfPath: string;
    lastUrdfPath: string;
    loadedSource: IluSharedLoadedSource | null;
};
export declare const isIluSharedLoadedSourceKind: (value: unknown) => value is IluSharedLoadedSourceKind;
export declare const coerceIluSharedLoadedSource: (raw: unknown, fallbackUrdfPath: string) => IluSharedLoadedSource | null;
export declare const coerceIluSharedSessionSnapshot: (raw: unknown) => IluSharedSessionSnapshot | null;
export declare const getIluSharedSessionGitHubSource: (loadedSource: IluSharedLoadedSource | null | undefined) => IluSharedSessionGitHubSource | null;

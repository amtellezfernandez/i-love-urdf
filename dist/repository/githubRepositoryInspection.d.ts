import { type FixMissingMeshReferencesOptions, type FixMissingMeshReferencesResult } from "./fixMissingMeshReferences";
import { type InspectRepositoryFilesOptions, type RepositoryCandidateInspection, type RepositoryInspectionSummary } from "./repositoryInspection";
export type GitHubRepositoryReference = {
    owner: string;
    repo: string;
    path?: string;
    ref?: string;
};
export type GitHubRepositoryFile = {
    name: string;
    path: string;
    type: "file" | "dir";
    download_url: string | null;
    size?: number;
    sha?: string;
    encoding?: "sha";
    sourceOwner?: string;
    sourceRepo?: string;
    sourcePath?: string;
};
export type GitHubRepositoryCandidateInspection = RepositoryCandidateInspection;
export type GitHubRepositoryInspectionResult = RepositoryInspectionSummary & {
    owner: string;
    repo: string;
    path: string | null;
    ref: string;
    repositoryUrl: string;
};
export type InspectGitHubRepositoryOptions = InspectRepositoryFilesOptions & {
    accessToken?: string;
};
export type RepairGitHubRepositoryOptions = FixMissingMeshReferencesOptions & {
    accessToken?: string;
    urdfPath?: string;
};
export type GitHubRepositoryMeshRepairResult = FixMissingMeshReferencesResult & {
    owner: string;
    repo: string;
    path: string | null;
    ref: string;
    urdfPath: string;
    repositoryUrl: string;
};
export declare const parseGitHubRepositoryReference: (value: string) => GitHubRepositoryReference | null;
export declare const fetchGitHubRepositoryFiles: (reference: GitHubRepositoryReference, accessToken?: string) => Promise<{
    ref: string;
    files: GitHubRepositoryFile[];
}>;
export declare const fetchGitHubTextFile: (owner: string, repo: string, filePath: string, blobSha?: string, accessToken?: string, ref?: string, downloadUrl?: string | null) => Promise<string>;
export declare const fetchGitHubFileBytes: (owner: string, repo: string, filePath: string, blobSha?: string, accessToken?: string, ref?: string, downloadUrl?: string | null) => Promise<Uint8Array>;
export declare const inspectGitHubRepositoryUrdfs: (reference: GitHubRepositoryReference, options?: InspectGitHubRepositoryOptions) => Promise<GitHubRepositoryInspectionResult>;
export declare const repairGitHubRepositoryMeshReferences: (reference: GitHubRepositoryReference, options?: RepairGitHubRepositoryOptions) => Promise<GitHubRepositoryMeshRepairResult>;

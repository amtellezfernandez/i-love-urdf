import { type GitHubRepositoryReference } from "../repository/githubRepositoryInspection";
import { type InspectRepositoryFilesOptions } from "../repository/repositoryInspection";
import { type XacroRuntimeName, type XacroRuntimeOptions } from "../xacro/xacroNode";
export type LoadSourceResult = {
    source: "local-file" | "local-repo" | "github";
    inspectedPath: string;
    rootPath?: string;
    repositoryUrl?: string;
    ref?: string;
    entryPath: string;
    entryFormat: "urdf" | "xacro";
    inspectionMode: "urdf" | "xacro-source";
    urdf: string;
    runtime: XacroRuntimeName | null;
    candidateCount?: number;
    primaryCandidatePath?: string | null;
};
export type LoadSourcePathOptions = XacroRuntimeOptions & InspectRepositoryFilesOptions & {
    path: string;
    entryPath?: string;
    rootPath?: string;
    args?: Record<string, string>;
    useInorder?: boolean;
};
export type LoadSourceGitHubOptions = XacroRuntimeOptions & InspectRepositoryFilesOptions & {
    reference: GitHubRepositoryReference;
    entryPath?: string;
    accessToken?: string;
    args?: Record<string, string>;
    useInorder?: boolean;
};
export declare const loadSourceFromPath: (options: LoadSourcePathOptions) => Promise<LoadSourceResult>;
export declare const loadSourceFromGitHub: (options: LoadSourceGitHubOptions) => Promise<LoadSourceResult>;

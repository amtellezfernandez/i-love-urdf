import { type GitHubRepositoryFile, type GitHubRepositoryReference } from "../repository/githubRepositoryInspection";
import { type RepositoryFileEntry } from "../repository/repositoryMeshResolution";
import { type XacroExpandRequestPayload } from "./xacroContract";
export type XacroRuntimeName = "python-xacro" | "vendored-xacrodoc";
export type XacroRuntimeOptions = {
    pythonExecutable?: string;
    wheelPath?: string;
    helperScriptPath?: string;
};
export type SetupXacroRuntimeOptions = XacroRuntimeOptions & {
    venvPath?: string;
    bootstrapPythonExecutable?: string;
};
export type XacroRuntimePackageVersions = Record<string, string>;
export type XacroRuntimeAvailability = {
    available: boolean;
    runtime?: XacroRuntimeName;
    error?: string;
    pythonExecutable: string;
    packageVersions: XacroRuntimePackageVersions;
};
export type SetupXacroRuntimeResult = XacroRuntimeAvailability & {
    venvPath: string;
    bootstrapPythonExecutable: string;
};
export type XacroExpandResult = {
    urdf: string;
    stderr?: string | null;
    runtime: XacroRuntimeName;
};
export type ExpandLocalXacroOptions = XacroRuntimeOptions & {
    xacroPath: string;
    rootPath?: string;
    args?: Record<string, string>;
    useInorder?: boolean;
};
export type LocalXacroExpansionResult = XacroExpandResult & {
    source: "local";
    rootPath: string;
    xacroPath: string;
    inspectedPath: string;
};
export type ExpandGitHubXacroOptions = XacroRuntimeOptions & {
    targetPath?: string;
    accessToken?: string;
    args?: Record<string, string>;
    useInorder?: boolean;
};
export type GitHubXacroExpansionResult = XacroExpandResult & {
    source: "github";
    owner: string;
    repo: string;
    ref: string;
    path: string | null;
    targetPath: string;
    repositoryUrl: string;
};
export declare const MANAGED_XACRO_RUNTIME_PACKAGES: readonly ["xacro==2.1.1", "PyYAML==6.0.3"];
export declare const probeXacroRuntime: (options?: XacroRuntimeOptions) => Promise<XacroRuntimeAvailability>;
export declare const setupXacroRuntime: (options?: SetupXacroRuntimeOptions) => Promise<SetupXacroRuntimeResult>;
export declare const expandXacroRequestPayload: (payload: XacroExpandRequestPayload, options?: XacroRuntimeOptions) => Promise<XacroExpandResult>;
export declare const buildXacroExpandPayloadFromRepository: <T extends RepositoryFileEntry>(files: T[], targetPath: string, readFileBytes: (file: T) => Promise<Uint8Array>, options?: {
    args?: Record<string, string>;
    useInorder?: boolean;
}) => Promise<XacroExpandRequestPayload>;
export declare const expandLocalXacroToUrdf: (options: ExpandLocalXacroOptions) => Promise<LocalXacroExpansionResult>;
export declare const expandGitHubRepositoryXacro: (reference: GitHubRepositoryReference, options?: ExpandGitHubXacroOptions) => Promise<GitHubXacroExpansionResult>;
export declare const expandFetchedGitHubRepositoryXacro: (reference: GitHubRepositoryReference, ref: string, files: GitHubRepositoryFile[], options?: ExpandGitHubXacroOptions) => Promise<GitHubXacroExpansionResult>;

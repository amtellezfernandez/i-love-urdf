import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
import { type GitHubRepositoryReference, type InspectGitHubRepositoryOptions } from "../repository/githubRepositoryInspection";
export type SourceCommandHelpers = Pick<CliCommandHelpers, "fail" | "getOptionalStringArg" | "getOptionalNumberArg" | "getKeyValueArg" | "writeOutIfRequested">;
export type SourceCommandHandler = (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void> | void;
export type XacroCliRuntimeOptions = {
    pythonExecutable?: string;
    wheelPath?: string;
};
export declare const emitJson: (value: unknown) => void;
export declare const emitJsonPayload: (helpers: SourceCommandHelpers, outPath: string | undefined, payload: unknown) => void;
export declare const emitTextOutputPayload: <T extends object>(helpers: SourceCommandHelpers, outPath: string | undefined, writtenContent: string, payload: T) => void;
export declare const getRepositoryInspectionOptions: (args: CliArgMap, helpers: SourceCommandHelpers) => InspectGitHubRepositoryOptions;
export declare const getXacroRuntimeOptions: (args: CliArgMap, helpers: SourceCommandHelpers) => XacroCliRuntimeOptions;
export declare const resolveGitHubRepositoryReference: (args: CliArgMap, githubValue: string, helpers: SourceCommandHelpers, pathArgName?: "path" | "subdir") => GitHubRepositoryReference;

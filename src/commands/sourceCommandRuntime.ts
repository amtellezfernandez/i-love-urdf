import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
import {
  parseGitHubRepositoryReference,
  type GitHubRepositoryReference,
  type InspectGitHubRepositoryOptions,
} from "../repository/githubRepositoryInspection";

export type SourceCommandHelpers = Pick<
  CliCommandHelpers,
  "fail" | "getOptionalStringArg" | "getOptionalNumberArg" | "getKeyValueArg" | "writeOutIfRequested"
>;

export type SourceCommandHandler = (
  args: CliArgMap,
  helpers: SourceCommandHelpers
) => Promise<void> | void;

export type XacroCliRuntimeOptions = {
  pythonExecutable?: string;
  wheelPath?: string;
};

export const emitJson = (value: unknown) => {
  console.log(JSON.stringify(value, null, 2));
};

export const emitJsonPayload = (
  helpers: SourceCommandHelpers,
  outPath: string | undefined,
  payload: unknown
) => {
  const serialized = JSON.stringify(payload, null, 2);
  helpers.writeOutIfRequested(outPath, serialized);
  console.log(serialized);
};

export const emitTextOutputPayload = <T extends object>(
  helpers: SourceCommandHelpers,
  outPath: string | undefined,
  writtenContent: string,
  payload: T
) => {
  helpers.writeOutIfRequested(outPath, writtenContent);
  emitJson({ ...payload, outPath: outPath || null });
};

export const getRepositoryInspectionOptions = (
  args: CliArgMap,
  helpers: SourceCommandHelpers
): InspectGitHubRepositoryOptions => ({
  maxCandidatesToInspect: helpers.getOptionalNumberArg(args, "max-candidates"),
  concurrency: helpers.getOptionalNumberArg(args, "concurrency"),
});

export const getXacroRuntimeOptions = (
  args: CliArgMap,
  helpers: SourceCommandHelpers
): XacroCliRuntimeOptions => ({
  pythonExecutable: helpers.getOptionalStringArg(args, "python"),
  wheelPath: helpers.getOptionalStringArg(args, "wheel"),
});

export const resolveGitHubRepositoryReference = (
  args: CliArgMap,
  githubValue: string,
  helpers: SourceCommandHelpers,
  pathArgName: "path" | "subdir" = "path"
): GitHubRepositoryReference => {
  const parsed = parseGitHubRepositoryReference(githubValue);
  if (!parsed) {
    helpers.fail("Invalid --github value. Expected owner/repo or a GitHub repository URL.");
  }

  const pathOverride = helpers.getOptionalStringArg(args, pathArgName);
  const refOverride = helpers.getOptionalStringArg(args, "ref");
  return {
    ...parsed,
    path: pathOverride ?? parsed.path,
    ref: refOverride ?? parsed.ref,
  };
};

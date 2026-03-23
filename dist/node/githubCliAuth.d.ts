import { spawnSync } from "node:child_process";
type SpawnSyncImpl = typeof spawnSync;
export declare const extractGitHubCliToken: (output: string | undefined) => string | undefined;
export declare const readGitHubCliToken: (spawnSyncImpl?: SpawnSyncImpl) => string | undefined;
export declare const resolveGitHubAccessToken: (explicitToken: string | undefined, env?: NodeJS.ProcessEnv, spawnSyncImpl?: SpawnSyncImpl) => string | undefined;
export {};

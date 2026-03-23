import type { CliArgMap } from "./commandHelpers";
export type UpdateAvailability = {
    currentVersion: string;
    latestVersion: string;
    installSpec: string;
};
type UpdateCheckOptions = {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    useCache?: boolean;
};
export declare const checkForUpdateAvailability: (options?: UpdateCheckOptions) => Promise<UpdateAvailability | null>;
export declare const renderUpdateHelp: () => string;
export declare const runUpdateCommand: (args?: CliArgMap) => void;
export {};

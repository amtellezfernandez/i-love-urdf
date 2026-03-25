import { type ChildProcess } from "node:child_process";
export type StudioFailureCode = "missing-repo" | "needs-setup" | "startup-failed";
export type ManagedStudioRuntime = {
    pid: number;
    studioRoot: string;
    webUrl: string;
    apiHealthUrl: string;
    startedAt: string;
};
export type StudioHandle = {
    startedHere: boolean;
    process: ChildProcess | null;
    close: () => void;
};
export type EnsureStudioRunningResult = {
    ok: true;
    handle: StudioHandle;
    studioRoot: string | null;
    webUrl: string;
    apiHealthUrl: string;
} | {
    ok: false;
    code: StudioFailureCode;
    reason: string;
    studioRoot: string | null;
    webUrl: string;
    apiHealthUrl: string;
};
export type StudioInstallState = {
    status: "ready";
    studioRoot: string;
    installRoot: string;
} | {
    status: "missing-repo" | "needs-setup";
    studioRoot: string | null;
    installRoot: string;
    reason: string;
};
export type InstallStudioResult = {
    ok: true;
    studioRoot: string;
    cloned: boolean;
    outputLines: string[];
} | {
    ok: false;
    studioRoot: string;
    cloned: boolean;
    reason: string;
    outputLines: string[];
};
export type StopManagedStudioResult = {
    ok: true;
    stopped: boolean;
    runtime: ManagedStudioRuntime;
} | {
    ok: false;
    stopped: boolean;
    reason: string;
    runtime: ManagedStudioRuntime | null;
};
export declare const getManagedStudioRuntimePath: () => string;
export declare const readManagedStudioRuntime: () => ManagedStudioRuntime | null;
export declare const isManagedStudioRunning: () => boolean;
export declare const getStudioWebUrl: () => string;
export declare const getStudioApiHealthUrl: () => string;
export declare const getDefaultStudioRootCandidates: () => string[];
export declare const getPreferredStudioInstallRoot: (explicitEnv?: string | null) => string;
export declare const isStudioRepoRoot: (studioRoot: string) => boolean;
export declare const resolveStudioRoot: (options?: {
    explicitEnv?: string | null;
    candidateRoots?: readonly string[];
}) => string | null;
export declare const getStudioInstallState: (options?: {
    explicitEnv?: string | null;
    candidateRoots?: readonly string[];
}) => StudioInstallState;
export declare const isStudioReady: (options?: {
    webUrl?: string;
    apiHealthUrl?: string;
}) => Promise<boolean>;
export declare const waitForStudioReady: (options?: {
    timeoutMs?: number;
    webUrl?: string;
    apiHealthUrl?: string;
}) => Promise<boolean>;
export declare const stopManagedStudio: () => Promise<StopManagedStudioResult>;
export declare const ensureStudioRunning: (options?: {
    detached?: boolean;
    timeoutMs?: number;
}) => Promise<EnsureStudioRunningResult>;
export declare const installStudio: () => InstallStudioResult;

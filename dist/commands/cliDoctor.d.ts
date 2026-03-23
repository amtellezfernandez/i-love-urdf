import type { CliArgMap } from "./commandHelpers";
type DoctorPlatformTier = "release-gated" | "ci-gated" | "unsupported";
export type DoctorReport = {
    generatedAt: string;
    ilu: {
        name: string;
        version: string;
        cliPath: string;
        repositoryUrl: string;
        installSpec: string;
    };
    runtime: {
        nodeVersion: string;
        nodeMajor: number;
        platform: NodeJS.Platform;
        arch: string;
        cwd: string;
        shell: string | null;
        stdinTty: boolean;
        stdoutTty: boolean;
    };
    support: {
        nodeSupported: boolean;
        platformSupported: boolean;
        platformTier: DoctorPlatformTier;
        notes: string[];
    };
    github: {
        envTokenConfigured: boolean;
        ghCliAvailable: boolean;
        ghCliAuthenticated: boolean;
        authenticated: boolean;
    };
    xacro: {
        available: boolean;
        runtime?: string;
        pythonExecutable: string;
        packageVersions: Record<string, string>;
        error?: string;
    };
};
export declare const collectDoctorReport: () => Promise<DoctorReport>;
export declare const renderDoctorHelp: () => string;
export declare const renderDoctorReport: (report: DoctorReport) => string;
export declare const runDoctorCommand: (args: CliArgMap) => Promise<void>;
export {};

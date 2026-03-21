import { type OrientationGuess, type OrientationGuessOptions } from "../analysis/guessOrientation";
import { type RobotOrientationCard } from "../analysis/robotOrientationCard";
import { type HealthCheckReport } from "../analysis/healthCheckUrdf";
import type { LoadSourceResult } from "../sources/loadSourceNode";
export type LocalMeshAudit = {
    usedFilesystemChecks: boolean;
    rootPath: string | null;
    urdfPath: string | null;
    totalMeshReferences: number;
    resolvedMeshReferences: string[];
    unresolvedMeshReferences: string[];
    sampledMeshFiles: string[];
    skippedUnsupportedMeshes: string[];
    skippedUnreadableMeshes: string[];
};
export type LoadedSourcePhysicsHealthReport = HealthCheckReport & {
    meshAudit: LocalMeshAudit;
};
export type LoadedSourceOrientationGuess = OrientationGuess & {
    meshAudit: LocalMeshAudit;
};
export type LoadedSourceOrientationCard = RobotOrientationCard & {
    meshAudit: LocalMeshAudit;
};
export declare const checkLoadedSourcePhysicsHealth: (source: LoadSourceResult) => Promise<LoadedSourcePhysicsHealthReport>;
export declare const guessLoadedSourceOrientation: (source: LoadSourceResult, options?: OrientationGuessOptions) => Promise<LoadedSourceOrientationGuess>;
export declare const buildLoadedSourceOrientationCard: (source: LoadSourceResult, options?: OrientationGuessOptions) => Promise<LoadedSourceOrientationCard>;

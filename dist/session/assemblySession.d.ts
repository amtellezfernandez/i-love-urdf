import { type IluAssemblySessionSnapshot } from "./assemblySessionContract";
import { type EnsureStudioRunningResult } from "../studio/studioRuntime";
export type { IluAssemblySessionRobot, IluAssemblySessionSnapshot, IluAssemblySessionSource } from "./assemblySessionContract";
export type CreateAssemblySessionParams = {
    urdfPaths: string[];
    label?: string;
};
export type CreateAssemblySessionResult = {
    snapshot: IluAssemblySessionSnapshot;
    sessionDir: string;
    copiedFiles: number;
};
export declare const buildStudioAssemblyUrl: (assemblySessionId: string) => string;
export declare const createAssemblySession: ({ urdfPaths, label, }: CreateAssemblySessionParams) => CreateAssemblySessionResult;
export declare const openStudioForAssemblySession: (assemblySessionId: string) => Promise<{
    studioUrl: string;
    opened: boolean;
    started: EnsureStudioRunningResult;
}>;

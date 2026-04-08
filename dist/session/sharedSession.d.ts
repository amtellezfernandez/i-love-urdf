import type { AutoAutomationResult, ShellState } from "../commands/cliShellTypes";
import { type IluSharedLoadedSource, type IluSharedSessionSnapshot } from "./sharedSessionContract";
export type { IluSharedLoadedSource, IluSharedSessionSnapshot } from "./sharedSessionContract";
export declare const getIluSharedSessionRoot: () => string;
export declare const getIluSharedSessionDir: (sessionId: string) => string;
export declare const getIluSharedSessionMetadataPath: (sessionId: string) => string;
export declare const getIluSharedSessionWorkingUrdfPath: (sessionId: string, fileNameHint?: string) => string;
export declare const readIluSharedSession: (sessionId: string) => IluSharedSessionSnapshot | null;
export declare const rememberIluRecentSession: (snapshot: IluSharedSessionSnapshot) => void;
export declare const readLatestIluSharedSession: () => IluSharedSessionSnapshot | null;
export declare const writeIluSharedSession: (params: {
    sessionId?: string;
    urdfContent: string;
    fileNameHint?: string;
    loadedSource: IluSharedLoadedSource | null;
    lastUrdfPath: string;
}) => IluSharedSessionSnapshot;
export declare const applySharedSessionSnapshotToState: (state: ShellState, snapshot: IluSharedSessionSnapshot, options?: {
    resetVisualizerPrompt?: boolean;
}) => void;
export declare const persistShellSharedSession: (state: ShellState, options?: {
    sourceUrdfPath?: string;
    urdfContent?: string;
    fileNameHint?: string;
}) => IluSharedSessionSnapshot | null;
export declare const attachShellToSharedSession: (state: ShellState, sessionId: string) => IluSharedSessionSnapshot;
export declare const buildStudioSessionUrl: (sessionId: string, options?: {
    focusJoint?: string;
    calibrateMode?: boolean;
}) => string;
export declare const openVisualizerForShellState: (state: ShellState) => Promise<AutoAutomationResult>;

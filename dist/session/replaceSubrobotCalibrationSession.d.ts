import { type EnsureStudioRunningResult } from "../studio/studioRuntime";
type StageCalibrationWorkspaceParams = {
    fileNameHint: string;
    hostUrdfPath: string;
    replacementUrdfPath: string;
    urdfContent: string;
};
export type StageCalibrationWorkspaceResult = {
    sessionId: string;
    sessionDir: string;
    workspaceRoot: string;
    workingUrdfPath: string;
    studioUrl: string;
    copiedFiles: number;
};
export declare const stageReplaceSubrobotCalibrationSession: ({ fileNameHint, hostUrdfPath, replacementUrdfPath, urdfContent, }: StageCalibrationWorkspaceParams) => StageCalibrationWorkspaceResult;
export declare const openStudioForReplaceSubrobotCalibration: (sessionId: string, options?: {
    focusJoint?: string;
    calibrateMode?: boolean;
}) => Promise<{
    studioUrl: string;
    opened: boolean;
    started: EnsureStudioRunningResult;
}>;
export {};

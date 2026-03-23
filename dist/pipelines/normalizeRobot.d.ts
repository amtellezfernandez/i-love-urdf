import { type HealthCheckReport } from "../analysis/healthCheckUrdf";
import { type AxisSpec } from "../utils/rotateRobot";
import { type AxisNormalizationResult } from "../utils/normalizeJointAxes";
import { type CanonicalizeJointFrameResult } from "../transforms/canonicalizeJointFrames";
export interface NormalizeRobotOptions {
    apply?: boolean;
    snapAxes?: boolean;
    canonicalizeJointFrame?: boolean;
    targetJointAxis?: "x" | "y" | "z";
    sourceUpAxis?: AxisSpec;
    sourceForwardAxis?: AxisSpec;
    targetUpAxis?: AxisSpec;
    targetForwardAxis?: AxisSpec;
    prettyPrint?: boolean;
    canonicalOrder?: boolean;
    axisSnapTolerance?: number;
}
export interface NormalizeRobotPlannedStep {
    name: string;
    enabled: boolean;
    reason: string;
}
export interface NormalizeRobotResult {
    apply: boolean;
    plannedSteps: NormalizeRobotPlannedStep[];
    healthBefore: HealthCheckReport;
    healthAfter?: HealthCheckReport;
    normalization?: {
        normalizedAxes?: AxisNormalizationResult;
        snappedAxes?: AxisNormalizationResult;
        canonicalizedJointFrames?: CanonicalizeJointFrameResult;
    };
    outputUrdf?: string;
}
export declare function normalizeRobot(urdfContent: string, options?: NormalizeRobotOptions): NormalizeRobotResult;

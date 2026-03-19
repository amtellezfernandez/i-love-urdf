import { type NormalizeRobotOptions } from "../pipelines/normalizeRobot";
import type { UrdfTransformResult } from "../transforms/urdfTransforms";
export type LoadedUrdfSourceLike = {
    urdf: string;
    entryPath?: string;
    inspectedPath?: string;
    rootPath?: string;
    source?: string;
    sourceKind?: string;
    inspectionMode?: string;
    repositoryUrl?: string;
    ref?: string;
};
export declare const replaceLoadedSourceUrdf: <T extends LoadedUrdfSourceLike>(source: T, urdf: string) => T;
export declare const validateLoadedSource: <T extends LoadedUrdfSourceLike>(source: T) => import("../validation/validateUrdf").UrdfValidationResult;
export declare const healthCheckLoadedSource: <T extends LoadedUrdfSourceLike>(source: T) => import("../analysis/healthCheckUrdf").HealthCheckReport;
export declare const analyzeLoadedSource: <T extends LoadedUrdfSourceLike>(source: T) => import("../analysis/analyzeUrdf").UrdfAnalysis;
export declare const guessOrientationLoadedSource: <T extends LoadedUrdfSourceLike>(source: T) => import("../analysis/guessOrientation").OrientationGuess;
export declare const compareLoadedSources: <TLeft extends LoadedUrdfSourceLike, TRight extends LoadedUrdfSourceLike>(left: TLeft, right: TRight) => import("../utils/urdfDiffUtils").UrdfComparisonResult;
export declare const prettyPrintLoadedSource: <T extends LoadedUrdfSourceLike>(source: T, indent?: number) => T;
export declare const canonicalOrderLoadedSource: <T extends LoadedUrdfSourceLike>(source: T) => T;
export declare const normalizeLoadedSourceAxes: <T extends LoadedUrdfSourceLike>(source: T) => {
    nextSource: T;
    urdfContent: string;
    corrections: import("../utils/normalizeJointAxes").AxisCorrection[];
    errors: import("../utils/normalizeJointAxes").AxisError[];
    snapped: import("../utils/normalizeJointAxes").AxisCorrection[];
};
export declare const snapLoadedSourceAxes: <T extends LoadedUrdfSourceLike>(source: T) => {
    nextSource: T;
    urdfContent: string;
    corrections: import("../utils/normalizeJointAxes").AxisCorrection[];
    errors: import("../utils/normalizeJointAxes").AxisError[];
    snapped: import("../utils/normalizeJointAxes").AxisCorrection[];
};
export declare const convertLoadedSourceToMJCF: <T extends LoadedUrdfSourceLike>(source: T) => import("../convert/urdfToMJCF").MJCFConversionResult;
export declare const convertLoadedSourceToXacro: <T extends LoadedUrdfSourceLike>(source: T) => import("../convert/urdfToXacro").ConversionResult;
export declare const normalizeLoadedSource: <T extends LoadedUrdfSourceLike>(source: T, options?: NormalizeRobotOptions) => {
    nextSource: T;
    apply: boolean;
    plannedSteps: import("../pipelines/normalizeRobot").NormalizeRobotPlannedStep[];
    healthBefore: import("../analysis/healthCheckUrdf").HealthCheckReport;
    healthAfter?: import("../analysis/healthCheckUrdf").HealthCheckReport;
    normalization?: {
        normalizedAxes?: import("../utils/normalizeJointAxes").AxisNormalizationResult;
        snappedAxes?: import("../utils/normalizeJointAxes").AxisNormalizationResult;
        canonicalizedJointFrames?: import("..").CanonicalizeJointFrameResult;
    };
    outputUrdf?: string;
};
export declare const applyLoadedSourceTransform: <T extends LoadedUrdfSourceLike, TResult extends UrdfTransformResult>(source: T, transform: (urdf: string) => TResult) => TResult & {
    nextSource: T;
};

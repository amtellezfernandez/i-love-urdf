import type { AxisSpec } from "../utils/rotateRobot";
export type OrientationAxis = "x" | "y" | "z";
export type OrientationSignal = {
    kind: "wheel-axis" | "joint-axis" | "geometry-span" | "pca-forward" | "pca-up" | "fallback";
    weight: number;
    message: string;
};
export type OrientationEvidence = {
    label: string;
    role: "up" | "forward" | "lateral";
    axis: AxisSpec | null;
    score: number;
    weight: number;
    contribution: number;
    details: string;
};
export type OrientationReport = {
    evidence: OrientationEvidence[];
    conflicts: string[];
};
export type OrientationGuessOptions = {
    targetUpAxis?: OrientationAxis;
    targetForwardAxis?: OrientationAxis;
};
export type OrientationGuess = {
    isValid: boolean;
    error?: string;
    robotName: string | null;
    likelyUpAxis: OrientationAxis | null;
    likelyUpDirection: AxisSpec | null;
    likelyForwardAxis: OrientationAxis | null;
    likelyForwardDirection: AxisSpec | null;
    likelyLateralAxis: OrientationAxis | null;
    likelyLateralDirection: AxisSpec | null;
    confidence: number;
    targetUpAxis: OrientationAxis;
    targetForwardAxis: OrientationAxis;
    suggestedRotate90: {
        axes: Array<"x" | "y" | "z">;
        commandSequence: string[];
        note: string;
    } | null;
    suggestedApplyOrientation: {
        sourceUpAxis: AxisSpec;
        sourceForwardAxis: AxisSpec;
        targetUpAxis: AxisSpec;
        targetForwardAxis: AxisSpec;
        command: string;
    } | null;
    spans: Record<OrientationAxis, number>;
    revoluteAxisVotes: Record<OrientationAxis, number>;
    wheelAxisVotes: Record<OrientationAxis, number>;
    wheelJointNames: string[];
    signals: OrientationSignal[];
    report: OrientationReport;
    assumptions: string[];
};
export declare function guessUrdfOrientation(urdfContent: string, options?: OrientationGuessOptions): OrientationGuess;

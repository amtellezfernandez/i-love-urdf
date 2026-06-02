import type { JointLimits } from "../parsing/parseJointLimits";
export type JointValueRange = {
    min: number;
    max: number;
};
export type JointValueConversionPlan = {
    mode: "identity" | "degrees_to_radians" | "servo_ticks_to_radians";
} | {
    mode: "linear_to_prismatic";
    rawMin: number;
    rawMax: number;
    targetLower: number;
    targetUpper: number;
};
export declare const JOINT_VALUE_CONVERSION_PARAMS: {
    readonly degToRad: number;
    readonly servoTicksLikelyAbsMax: 360;
    readonly servoTickNeutral: 2048;
    readonly servoTickFullScale: 2048;
    readonly prismaticRangeExpansionThreshold: 1.5;
    readonly normalizedInputLower: 0;
    readonly normalizedInputUpper: 100;
    readonly normalizedOutputLower: 0;
    readonly normalizedOutputUpper: 1;
    readonly rangeEpsilon: 1e-9;
};
export declare const resolveJointValueConversionPlan: ({ rawRange, targetJointName, jointLimits, angularConversionEnabled, }: {
    rawRange?: JointValueRange | null;
    targetJointName: string;
    jointLimits?: JointLimits;
    angularConversionEnabled: boolean;
}) => JointValueConversionPlan;
export declare const convertJointValueWithPlan: (rawValue: number, plan: JointValueConversionPlan) => number;

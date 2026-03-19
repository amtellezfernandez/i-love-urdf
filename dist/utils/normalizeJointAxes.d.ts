export interface AxisNormalizationOptions {
    epsilon?: number;
    defaultAxis?: [number, number, number];
    snapToCanonical?: boolean;
    snapTolerance?: number;
}
export interface AxisCorrection {
    jointName: string;
    jointType: string;
    original: string;
    corrected: string;
    reason: string;
}
export interface AxisError {
    jointName: string;
    jointType: string;
    issue: string;
}
export interface AxisNormalizationResult {
    urdfContent: string;
    corrections: AxisCorrection[];
    errors: AxisError[];
    snapped: AxisCorrection[];
}
export declare function normalizeJointAxes(urdfContent: string, options?: AxisNormalizationOptions): AxisNormalizationResult;
export declare function snapJointAxes(urdfContent: string, options?: Omit<AxisNormalizationOptions, "snapToCanonical">): AxisNormalizationResult;

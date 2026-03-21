import { type Mat3 } from "./rotationMath";
export type AxisSpec = "x" | "y" | "z" | "+x" | "+y" | "+z" | "-x" | "-y" | "-z";
export declare function buildOrientationMappingRotation(options: {
    sourceForwardAxis: AxisSpec;
    sourceUpAxis: AxisSpec;
    targetForwardAxis?: AxisSpec;
    targetUpAxis?: AxisSpec;
}): Mat3;
export declare function applyGlobalRotation(urdfContent: string, R: Mat3): string;
export declare function applyOrientationToRobot(urdfContent: string, options: {
    sourceForwardAxis: AxisSpec;
    sourceUpAxis: AxisSpec;
    targetForwardAxis?: AxisSpec;
    targetUpAxis?: AxisSpec;
}): string;
export declare function rotateRobot90Degrees(urdfContent: string, axis: "x" | "y" | "z"): string;

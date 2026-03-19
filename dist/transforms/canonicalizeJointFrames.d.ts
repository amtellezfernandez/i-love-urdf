import type { UrdfTransformResult } from "./urdfTransforms";
export interface CanonicalizeJointFrameOptions {
    targetAxis?: "x" | "y" | "z";
    joints?: Iterable<string>;
}
export interface CanonicalizeJointFrameSkip {
    jointName: string;
    reason: string;
}
export interface CanonicalizeJointFrameResult extends UrdfTransformResult {
    changedJoints: string[];
    skippedJoints: CanonicalizeJointFrameSkip[];
}
export declare function canonicalizeJointFrames(urdfContent: string, options?: CanonicalizeJointFrameOptions): CanonicalizeJointFrameResult;

export type AxisFrameVec3 = [number, number, number];
export type AxisFrameQuat = [number, number, number, number];
export type AxisFrameBasis = {
    forward: AxisFrameVec3;
    right: AxisFrameVec3;
    up: AxisFrameVec3;
};
export type BuildAxisFrameBasisOptions = {
    forwardHint: AxisFrameVec3;
    upHint: AxisFrameVec3 | null;
    fallbackForward?: AxisFrameVec3;
    fallbackUp?: AxisFrameVec3;
};
export declare const AXIS_FRAME_EPSILON = 1e-10;
export declare const normalizeDirection: (candidate: AxisFrameVec3, fallback: AxisFrameVec3) => AxisFrameVec3;
export declare const projectVectorOntoPlane: (vector: AxisFrameVec3, planeNormal: AxisFrameVec3) => AxisFrameVec3;
export declare const projectDirectionOntoPlane: (direction: AxisFrameVec3, planeNormal: AxisFrameVec3, fallbackDirection: AxisFrameVec3) => AxisFrameVec3;
export declare const getPerpendicularDirection: (upAxis: AxisFrameVec3, fallbackDirection?: AxisFrameVec3) => AxisFrameVec3;
export declare const worldDirectionFromLocal: (localDirection: AxisFrameVec3, worldQuaternion: AxisFrameQuat) => AxisFrameVec3;
export declare const localDirectionFromWorld: (worldDirection: AxisFrameVec3, worldQuaternion: AxisFrameQuat) => AxisFrameVec3;
export declare const resolveForwardWorldFromWheelAxes: (averageWheelAxisWorld: AxisFrameVec3, worldUp: AxisFrameVec3, robotForwardFallback: AxisFrameVec3) => AxisFrameVec3;
export declare const buildAxisFrameBasis: ({ forwardHint, upHint, fallbackForward, fallbackUp, }: BuildAxisFrameBasisOptions) => AxisFrameBasis;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAxisFrameBasis = exports.resolveForwardWorldFromWheelAxes = exports.localDirectionFromWorld = exports.worldDirectionFromLocal = exports.getPerpendicularDirection = exports.projectDirectionOntoPlane = exports.projectVectorOntoPlane = exports.normalizeDirection = exports.AXIS_FRAME_EPSILON = void 0;
exports.AXIS_FRAME_EPSILON = 1e-10;
const DEFAULT_FORWARD = [1, 0, 0];
const DEFAULT_UP = [0, 0, 1];
const FALLBACK_UP_REFERENCE = [0, 1, 0];
const dot = (left, right) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const lengthSq = (vector) => dot(vector, vector);
const normalize = (vector) => {
    const magnitude = Math.sqrt(lengthSq(vector));
    if (magnitude < exports.AXIS_FRAME_EPSILON) {
        return [0, 0, 0];
    }
    return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
};
const cross = (left, right) => [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
];
const addScaledVector = (vector, direction, scale) => [
    vector[0] + direction[0] * scale,
    vector[1] + direction[1] * scale,
    vector[2] + direction[2] * scale,
];
const conjugateQuaternion = ([x, y, z, w]) => [-x, -y, -z, w];
const multiplyQuaternion = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
];
const rotateVectorByQuaternion = ([vx, vy, vz], quaternion) => {
    const pure = [vx, vy, vz, 0];
    const rotated = multiplyQuaternion(multiplyQuaternion(quaternion, pure), conjugateQuaternion(quaternion));
    return [rotated[0], rotated[1], rotated[2]];
};
const normalizeDirection = (candidate, fallback) => {
    if (!Number.isFinite(candidate[0]) ||
        !Number.isFinite(candidate[1]) ||
        !Number.isFinite(candidate[2]) ||
        lengthSq(candidate) < exports.AXIS_FRAME_EPSILON) {
        return normalize(fallback);
    }
    return normalize(candidate);
};
exports.normalizeDirection = normalizeDirection;
const projectVectorOntoPlane = (vector, planeNormal) => {
    const normalizedPlaneNormal = (0, exports.normalizeDirection)(planeNormal, DEFAULT_UP);
    return addScaledVector(vector, normalizedPlaneNormal, -dot(vector, normalizedPlaneNormal));
};
exports.projectVectorOntoPlane = projectVectorOntoPlane;
const projectDirectionOntoPlane = (direction, planeNormal, fallbackDirection) => (0, exports.normalizeDirection)((0, exports.projectVectorOntoPlane)(direction, planeNormal), fallbackDirection);
exports.projectDirectionOntoPlane = projectDirectionOntoPlane;
const getPerpendicularDirection = (upAxis, fallbackDirection = DEFAULT_FORWARD) => {
    const normalizedUpAxis = (0, exports.normalizeDirection)(upAxis, DEFAULT_UP);
    const preferredReference = Math.abs(normalizedUpAxis[2]) < 0.9 ? [0, 0, 1] : normalize(fallbackDirection);
    const candidate = cross(preferredReference, normalizedUpAxis);
    return (0, exports.normalizeDirection)(candidate, fallbackDirection);
};
exports.getPerpendicularDirection = getPerpendicularDirection;
const worldDirectionFromLocal = (localDirection, worldQuaternion) => (0, exports.normalizeDirection)(rotateVectorByQuaternion(localDirection, worldQuaternion), DEFAULT_FORWARD);
exports.worldDirectionFromLocal = worldDirectionFromLocal;
const localDirectionFromWorld = (worldDirection, worldQuaternion) => (0, exports.normalizeDirection)(rotateVectorByQuaternion(worldDirection, conjugateQuaternion(worldQuaternion)), DEFAULT_FORWARD);
exports.localDirectionFromWorld = localDirectionFromWorld;
const resolveForwardWorldFromWheelAxes = (averageWheelAxisWorld, worldUp, robotForwardFallback) => {
    const upAxis = (0, exports.normalizeDirection)(worldUp, DEFAULT_UP);
    const wheelAxis = (0, exports.normalizeDirection)(averageWheelAxisWorld, FALLBACK_UP_REFERENCE);
    const derivedForward = cross(wheelAxis, upAxis);
    const planarForward = (0, exports.projectDirectionOntoPlane)(derivedForward, upAxis, (0, exports.projectDirectionOntoPlane)(robotForwardFallback, upAxis, DEFAULT_FORWARD));
    return (0, exports.normalizeDirection)(planarForward, (0, exports.getPerpendicularDirection)(upAxis));
};
exports.resolveForwardWorldFromWheelAxes = resolveForwardWorldFromWheelAxes;
const buildAxisFrameBasis = ({ forwardHint, upHint, fallbackForward = DEFAULT_FORWARD, fallbackUp = DEFAULT_UP, }) => {
    const forward = (0, exports.normalizeDirection)(forwardHint, fallbackForward);
    const upReference = upHint ?? fallbackUp;
    const projectedUp = addScaledVector(upReference, forward, -dot(upReference, forward));
    const upBase = (0, exports.normalizeDirection)(projectedUp, fallbackUp);
    let right = cross(upBase, forward);
    right = (0, exports.normalizeDirection)(right, FALLBACK_UP_REFERENCE);
    let up = cross(forward, right);
    up = (0, exports.normalizeDirection)(up, fallbackUp);
    const projectedFallbackUp = addScaledVector(fallbackUp, forward, -dot(fallbackUp, forward));
    if (lengthSq(projectedFallbackUp) >= exports.AXIS_FRAME_EPSILON) {
        const normalizedFallbackUp = normalize(projectedFallbackUp);
        if (dot(up, normalizedFallbackUp) < 0) {
            up = [-up[0], -up[1], -up[2]];
            right = [-right[0], -right[1], -right[2]];
        }
    }
    return {
        forward,
        right,
        up,
    };
};
exports.buildAxisFrameBasis = buildAxisFrameBasis;

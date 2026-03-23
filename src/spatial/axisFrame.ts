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

export const AXIS_FRAME_EPSILON = 1e-10;

const DEFAULT_FORWARD: AxisFrameVec3 = [1, 0, 0];
const DEFAULT_UP: AxisFrameVec3 = [0, 0, 1];
const FALLBACK_UP_REFERENCE: AxisFrameVec3 = [0, 1, 0];

const dot = (left: AxisFrameVec3, right: AxisFrameVec3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const lengthSq = (vector: AxisFrameVec3) => dot(vector, vector);

const normalize = (vector: AxisFrameVec3): AxisFrameVec3 => {
  const magnitude = Math.sqrt(lengthSq(vector));
  if (magnitude < AXIS_FRAME_EPSILON) {
    return [0, 0, 0];
  }
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
};

const cross = (left: AxisFrameVec3, right: AxisFrameVec3): AxisFrameVec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const addScaledVector = (
  vector: AxisFrameVec3,
  direction: AxisFrameVec3,
  scale: number
): AxisFrameVec3 => [
  vector[0] + direction[0] * scale,
  vector[1] + direction[1] * scale,
  vector[2] + direction[2] * scale,
];

const conjugateQuaternion = ([x, y, z, w]: AxisFrameQuat): AxisFrameQuat => [-x, -y, -z, w];

const multiplyQuaternion = (
  [ax, ay, az, aw]: AxisFrameQuat,
  [bx, by, bz, bw]: AxisFrameQuat
): AxisFrameQuat => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

const rotateVectorByQuaternion = (
  [vx, vy, vz]: AxisFrameVec3,
  quaternion: AxisFrameQuat
): AxisFrameVec3 => {
  const pure: AxisFrameQuat = [vx, vy, vz, 0];
  const rotated = multiplyQuaternion(
    multiplyQuaternion(quaternion, pure),
    conjugateQuaternion(quaternion)
  );
  return [rotated[0], rotated[1], rotated[2]];
};

export const normalizeDirection = (
  candidate: AxisFrameVec3,
  fallback: AxisFrameVec3
): AxisFrameVec3 => {
  if (
    !Number.isFinite(candidate[0]) ||
    !Number.isFinite(candidate[1]) ||
    !Number.isFinite(candidate[2]) ||
    lengthSq(candidate) < AXIS_FRAME_EPSILON
  ) {
    return normalize(fallback);
  }
  return normalize(candidate);
};

export const projectVectorOntoPlane = (
  vector: AxisFrameVec3,
  planeNormal: AxisFrameVec3
): AxisFrameVec3 => {
  const normalizedPlaneNormal = normalizeDirection(planeNormal, DEFAULT_UP);
  return addScaledVector(vector, normalizedPlaneNormal, -dot(vector, normalizedPlaneNormal));
};

export const projectDirectionOntoPlane = (
  direction: AxisFrameVec3,
  planeNormal: AxisFrameVec3,
  fallbackDirection: AxisFrameVec3
): AxisFrameVec3 => normalizeDirection(projectVectorOntoPlane(direction, planeNormal), fallbackDirection);

export const getPerpendicularDirection = (
  upAxis: AxisFrameVec3,
  fallbackDirection: AxisFrameVec3 = DEFAULT_FORWARD
): AxisFrameVec3 => {
  const normalizedUpAxis = normalizeDirection(upAxis, DEFAULT_UP);
  const preferredReference =
    Math.abs(normalizedUpAxis[2]) < 0.9 ? ([0, 0, 1] as AxisFrameVec3) : normalize(fallbackDirection);
  const candidate = cross(preferredReference, normalizedUpAxis);
  return normalizeDirection(candidate, fallbackDirection);
};

export const worldDirectionFromLocal = (
  localDirection: AxisFrameVec3,
  worldQuaternion: AxisFrameQuat
): AxisFrameVec3 => normalizeDirection(rotateVectorByQuaternion(localDirection, worldQuaternion), DEFAULT_FORWARD);

export const localDirectionFromWorld = (
  worldDirection: AxisFrameVec3,
  worldQuaternion: AxisFrameQuat
): AxisFrameVec3 =>
  normalizeDirection(
    rotateVectorByQuaternion(worldDirection, conjugateQuaternion(worldQuaternion)),
    DEFAULT_FORWARD
  );

export const resolveForwardWorldFromWheelAxes = (
  averageWheelAxisWorld: AxisFrameVec3,
  worldUp: AxisFrameVec3,
  robotForwardFallback: AxisFrameVec3
): AxisFrameVec3 => {
  const upAxis = normalizeDirection(worldUp, DEFAULT_UP);
  const wheelAxis = normalizeDirection(averageWheelAxisWorld, FALLBACK_UP_REFERENCE);
  const derivedForward = cross(wheelAxis, upAxis);
  const planarForward = projectDirectionOntoPlane(
    derivedForward,
    upAxis,
    projectDirectionOntoPlane(robotForwardFallback, upAxis, DEFAULT_FORWARD)
  );
  return normalizeDirection(planarForward, getPerpendicularDirection(upAxis));
};

export const buildAxisFrameBasis = ({
  forwardHint,
  upHint,
  fallbackForward = DEFAULT_FORWARD,
  fallbackUp = DEFAULT_UP,
}: BuildAxisFrameBasisOptions): AxisFrameBasis => {
  const forward = normalizeDirection(forwardHint, fallbackForward);
  const upReference = upHint ?? fallbackUp;
  const projectedUp = addScaledVector(upReference, forward, -dot(upReference, forward));
  const upBase = normalizeDirection(projectedUp, fallbackUp);

  let right = cross(upBase, forward);
  right = normalizeDirection(right, FALLBACK_UP_REFERENCE);
  let up = cross(forward, right);
  up = normalizeDirection(up, fallbackUp);

  const projectedFallbackUp = addScaledVector(fallbackUp, forward, -dot(fallbackUp, forward));
  if (lengthSq(projectedFallbackUp) >= AXIS_FRAME_EPSILON) {
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

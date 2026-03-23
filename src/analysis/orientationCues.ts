export type OrientationVec3 = [number, number, number];

export type DirectionSample = {
  offset: OrientationVec3;
  distance: number;
};

export type PrincipalAxes = {
  primary: OrientationVec3;
  secondary: OrientationVec3;
  tertiary: OrientationVec3;
};

export type DirectionCue = {
  axis: OrientationVec3;
  confidence: number;
};

const EPSILON = 1e-9;
const BASIS_X: OrientationVec3 = [1, 0, 0];
const BASIS_Y: OrientationVec3 = [0, 1, 0];
const BASIS_Z: OrientationVec3 = [0, 0, 1];
const BASIS_CANDIDATES: readonly OrientationVec3[] = [BASIS_X, BASIS_Y, BASIS_Z];

type Matrix3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const dot = (left: OrientationVec3, right: OrientationVec3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const magnitude = (vector: OrientationVec3) =>
  Math.sqrt(dot(vector, vector));

const normalize = (
  vector: OrientationVec3,
  fallback: OrientationVec3 = BASIS_X
): OrientationVec3 => {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length < EPSILON) {
    return [...fallback] as OrientationVec3;
  }
  return [
    vector[0] / length,
    vector[1] / length,
    vector[2] / length,
  ];
};

const addScaled = (
  base: OrientationVec3,
  direction: OrientationVec3,
  scale: number
): OrientationVec3 => [
  base[0] + direction[0] * scale,
  base[1] + direction[1] * scale,
  base[2] + direction[2] * scale,
];

const subtractProjection = (
  vector: OrientationVec3,
  axis: OrientationVec3
): OrientationVec3 => addScaled(vector, axis, -dot(vector, axis));

const cross = (left: OrientationVec3, right: OrientationVec3): OrientationVec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const multiplyMatrixByVector = (
  matrix: Matrix3,
  vector: OrientationVec3
): OrientationVec3 => [
  matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
  matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
  matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
];

const toCovarianceMatrix = (samples: DirectionSample[]): Matrix3 => {
  const covariance: Matrix3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  samples.forEach((sample) => {
    const [x, y, z] = sample.offset;
    covariance[0] += x * x;
    covariance[1] += x * y;
    covariance[2] += x * z;
    covariance[3] += y * x;
    covariance[4] += y * y;
    covariance[5] += y * z;
    covariance[6] += z * x;
    covariance[7] += z * y;
    covariance[8] += z * z;
  });
  const normalizer = Math.max(samples.length, 1);
  for (let index = 0; index < covariance.length; index += 1) {
    covariance[index] /= normalizer;
  }
  return covariance;
};

const powerIteratePrincipalAxis = (
  matrix: Matrix3,
  seed: OrientationVec3,
  steps = 16
): { axis: OrientationVec3; eigenvalue: number } | null => {
  let axis = normalize(seed);
  if (magnitude(axis) < EPSILON) return null;

  for (let step = 0; step < steps; step += 1) {
    const transformed = multiplyMatrixByVector(matrix, axis);
    if (magnitude(transformed) < EPSILON) return null;
    axis = normalize(transformed);
  }

  const transformed = multiplyMatrixByVector(matrix, axis);
  const eigenvalue = dot(axis, transformed);
  if (!Number.isFinite(eigenvalue) || eigenvalue < EPSILON) return null;
  return { axis, eigenvalue };
};

const deflateMatrixAlongAxis = (
  matrix: Matrix3,
  axis: OrientationVec3,
  eigenvalue: number
): Matrix3 => [
  matrix[0] - eigenvalue * axis[0] * axis[0],
  matrix[1] - eigenvalue * axis[0] * axis[1],
  matrix[2] - eigenvalue * axis[0] * axis[2],
  matrix[3] - eigenvalue * axis[1] * axis[0],
  matrix[4] - eigenvalue * axis[1] * axis[1],
  matrix[5] - eigenvalue * axis[1] * axis[2],
  matrix[6] - eigenvalue * axis[2] * axis[0],
  matrix[7] - eigenvalue * axis[2] * axis[1],
  matrix[8] - eigenvalue * axis[2] * axis[2],
];

const chooseOrthogonalAxisSeed = (axis: OrientationVec3): OrientationVec3 => {
  const bestBasis =
    BASIS_CANDIDATES.find((basis) => Math.abs(dot(axis, basis)) <= 0.8) ?? BASIS_Z;
  const candidate = subtractProjection(bestBasis, axis);
  if (magnitude(candidate) >= EPSILON) {
    return normalize(candidate);
  }
  return normalize([-axis[1], axis[0], 0]);
};

export const resolvePrincipalAxesFromDirectionSamples = (
  samples: DirectionSample[]
): PrincipalAxes | null => {
  if (samples.length === 0) return null;
  const covariance = toCovarianceMatrix(samples);
  const firstEigen =
    powerIteratePrincipalAxis(covariance, BASIS_X) ??
    powerIteratePrincipalAxis(covariance, BASIS_Y) ??
    powerIteratePrincipalAxis(covariance, BASIS_Z);
  if (!firstEigen) return null;

  const deflated = deflateMatrixAlongAxis(
    covariance,
    firstEigen.axis,
    firstEigen.eigenvalue
  );
  const secondSeed = chooseOrthogonalAxisSeed(firstEigen.axis);
  const secondEigen = powerIteratePrincipalAxis(deflated, secondSeed);
  const secondary = secondEigen?.axis ?? secondSeed;
  const tertiaryRaw = cross(firstEigen.axis, secondary);
  if (magnitude(tertiaryRaw) < EPSILON) return null;
  const tertiary = normalize(tertiaryRaw);
  const normalizedSecondary = normalize(cross(tertiary, firstEigen.axis));

  return {
    primary: normalize(firstEigen.axis),
    secondary: normalizedSecondary,
    tertiary,
  };
};

const resolveDirectionCandidates = (
  samples: DirectionSample[],
  principalAxes: PrincipalAxes | null
): OrientationVec3[] => {
  const axes: OrientationVec3[] = [];

  const pushUnique = (axis: OrientationVec3) => {
    const normalized = normalize(axis);
    if (magnitude(normalized) < EPSILON) return;
    const duplicate = axes.some(
      (existing) => Math.abs(dot(existing, normalized)) >= 0.95
    );
    if (!duplicate) axes.push(normalized);
  };

  if (principalAxes) {
    pushUnique(principalAxes.primary);
    pushUnique(principalAxes.secondary);
    pushUnique(principalAxes.tertiary);
  }

  const weightedOffset: OrientationVec3 = [0, 0, 0];
  samples.forEach((sample) => {
    weightedOffset[0] += sample.offset[0] * sample.distance * sample.distance;
    weightedOffset[1] += sample.offset[1] * sample.distance * sample.distance;
    weightedOffset[2] += sample.offset[2] * sample.distance * sample.distance;
  });
  pushUnique(weightedOffset);

  return axes;
};

const scoreDirectionAxis = (
  axis: OrientationVec3,
  samples: DirectionSample[]
): DirectionCue | null => {
  const normalizedAxis = normalize(axis);
  let frontSupport = 0;
  let backSupport = 0;
  let maxFrontExtent = 0;
  let maxBackExtent = 0;
  let maxDistance = 0;

  samples.forEach((sample) => {
    const projection = dot(sample.offset, normalizedAxis);
    maxDistance = Math.max(maxDistance, sample.distance);
    if (projection >= 0) {
      frontSupport += projection * projection * sample.distance;
      maxFrontExtent = Math.max(maxFrontExtent, projection);
      return;
    }
    const backProjection = -projection;
    backSupport += backProjection * backProjection * sample.distance;
    maxBackExtent = Math.max(maxBackExtent, backProjection);
  });

  const span = maxFrontExtent + maxBackExtent;
  const totalSupport = frontSupport + backSupport;
  if (span < EPSILON || totalSupport < EPSILON || maxDistance < EPSILON) return null;

  const extentAsymmetry = (maxFrontExtent - maxBackExtent) / span;
  const supportAsymmetry = (frontSupport - backSupport) / totalSupport;
  const combinedAsymmetry = 0.55 * extentAsymmetry + 0.45 * supportAsymmetry;
  const confidence = Math.abs(combinedAsymmetry) * Math.min(span / maxDistance, 1);
  if (!Number.isFinite(confidence) || confidence < 0.05) return null;

  const sign = combinedAsymmetry >= 0 ? 1 : -1;
  return {
    axis: [
      normalizedAxis[0] * sign,
      normalizedAxis[1] * sign,
      normalizedAxis[2] * sign,
    ],
    confidence,
  };
};

export const resolveDirectionCueFromDirectionSamples = (
  samples: DirectionSample[]
): DirectionCue | null => {
  if (samples.length === 0) return null;
  const principalAxes = resolvePrincipalAxesFromDirectionSamples(samples);
  const candidates = resolveDirectionCandidates(samples, principalAxes);
  let best: DirectionCue | null = null;
  candidates.forEach((candidate) => {
    const cue = scoreDirectionAxis(candidate, samples);
    if (!cue) return;
    if (!best || cue.confidence > best.confidence) {
      best = cue;
    }
  });
  return best;
};

const resolveAxisSpanFromSamples = (
  samples: DirectionSample[],
  axis: OrientationVec3
) => {
  let minProjection = Infinity;
  let maxProjection = -Infinity;
  samples.forEach((sample) => {
    const projection = dot(sample.offset, axis);
    if (projection < minProjection) minProjection = projection;
    if (projection > maxProjection) maxProjection = projection;
  });
  if (!Number.isFinite(minProjection) || !Number.isFinite(maxProjection)) return 0;
  return maxProjection - minProjection;
};

const projectAxisOrthogonalToForward = (
  axis: OrientationVec3,
  forwardDirection: OrientationVec3
): OrientationVec3 | null => {
  const projected = subtractProjection(axis, forwardDirection);
  if (magnitude(projected) < EPSILON) return null;
  return normalize(projected);
};

const orientAxisToReference = (
  axis: OrientationVec3,
  forwardDirection: OrientationVec3,
  upReference: OrientationVec3
): OrientationVec3 => {
  const oriented = normalize(axis);
  const projectedReference = subtractProjection(upReference, forwardDirection);
  if (magnitude(projectedReference) < EPSILON) return oriented;
  const normalizedReference = normalize(projectedReference);
  return dot(oriented, normalizedReference) < 0
    ? [-oriented[0], -oriented[1], -oriented[2]]
    : oriented;
};

export const resolveUpCueFromDirectionSamples = (
  samples: DirectionSample[],
  forwardDirection: OrientationVec3,
  upReference: OrientationVec3
): DirectionCue | null => {
  if (samples.length === 0) return null;
  if (magnitude(forwardDirection) < EPSILON || magnitude(upReference) < EPSILON) {
    return null;
  }
  const forward = normalize(forwardDirection);
  const principalAxes = resolvePrincipalAxesFromDirectionSamples(samples);
  if (!principalAxes) return null;

  const candidateAxes = [
    principalAxes.primary,
    principalAxes.secondary,
    principalAxes.tertiary,
  ];
  const projectedReference = projectAxisOrthogonalToForward(upReference, forward);
  let bestAxis: OrientationVec3 | null = null;
  let bestScore = -Infinity;
  let bestSpan = 0;
  let maxSpan = 0;

  const candidates = candidateAxes
    .map((candidate) => {
      const projected = projectAxisOrthogonalToForward(candidate, forward);
      if (!projected) return null;
      const span = resolveAxisSpanFromSamples(samples, projected);
      maxSpan = Math.max(maxSpan, span);
      return { axis: projected, span };
    })
    .filter((candidate): candidate is { axis: OrientationVec3; span: number } => Boolean(candidate));

  if (candidates.length === 0) return null;

  candidates.forEach((candidate) => {
    const alignment = projectedReference
      ? Math.abs(dot(candidate.axis, projectedReference))
      : 0.5;
    const spanNormalized = maxSpan > EPSILON ? candidate.span / maxSpan : 0;
    const score = alignment * 0.6 + spanNormalized * 0.4;
    if (score > bestScore) {
      bestScore = score;
      bestAxis = candidate.axis;
      bestSpan = spanNormalized;
    }
  });

  if (!bestAxis) return null;
  return {
    axis: orientAxisToReference(bestAxis, forward, upReference),
    confidence: Math.max(0, Math.min(1, bestScore * 0.7 + bestSpan * 0.3)),
  };
};

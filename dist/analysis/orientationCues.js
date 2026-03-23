"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUpCueFromDirectionSamples = exports.resolveDirectionCueFromDirectionSamples = exports.resolvePrincipalAxesFromDirectionSamples = void 0;
const EPSILON = 1e-9;
const BASIS_X = [1, 0, 0];
const BASIS_Y = [0, 1, 0];
const BASIS_Z = [0, 0, 1];
const BASIS_CANDIDATES = [BASIS_X, BASIS_Y, BASIS_Z];
const dot = (left, right) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const magnitude = (vector) => Math.sqrt(dot(vector, vector));
const normalize = (vector, fallback = BASIS_X) => {
    const length = magnitude(vector);
    if (!Number.isFinite(length) || length < EPSILON) {
        return [...fallback];
    }
    return [
        vector[0] / length,
        vector[1] / length,
        vector[2] / length,
    ];
};
const addScaled = (base, direction, scale) => [
    base[0] + direction[0] * scale,
    base[1] + direction[1] * scale,
    base[2] + direction[2] * scale,
];
const subtractProjection = (vector, axis) => addScaled(vector, axis, -dot(vector, axis));
const cross = (left, right) => [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
];
const multiplyMatrixByVector = (matrix, vector) => [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
];
const toCovarianceMatrix = (samples) => {
    const covariance = [0, 0, 0, 0, 0, 0, 0, 0, 0];
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
const powerIteratePrincipalAxis = (matrix, seed, steps = 16) => {
    let axis = normalize(seed);
    if (magnitude(axis) < EPSILON)
        return null;
    for (let step = 0; step < steps; step += 1) {
        const transformed = multiplyMatrixByVector(matrix, axis);
        if (magnitude(transformed) < EPSILON)
            return null;
        axis = normalize(transformed);
    }
    const transformed = multiplyMatrixByVector(matrix, axis);
    const eigenvalue = dot(axis, transformed);
    if (!Number.isFinite(eigenvalue) || eigenvalue < EPSILON)
        return null;
    return { axis, eigenvalue };
};
const deflateMatrixAlongAxis = (matrix, axis, eigenvalue) => [
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
const chooseOrthogonalAxisSeed = (axis) => {
    const bestBasis = BASIS_CANDIDATES.find((basis) => Math.abs(dot(axis, basis)) <= 0.8) ?? BASIS_Z;
    const candidate = subtractProjection(bestBasis, axis);
    if (magnitude(candidate) >= EPSILON) {
        return normalize(candidate);
    }
    return normalize([-axis[1], axis[0], 0]);
};
const resolvePrincipalAxesFromDirectionSamples = (samples) => {
    if (samples.length === 0)
        return null;
    const covariance = toCovarianceMatrix(samples);
    const firstEigen = powerIteratePrincipalAxis(covariance, BASIS_X) ??
        powerIteratePrincipalAxis(covariance, BASIS_Y) ??
        powerIteratePrincipalAxis(covariance, BASIS_Z);
    if (!firstEigen)
        return null;
    const deflated = deflateMatrixAlongAxis(covariance, firstEigen.axis, firstEigen.eigenvalue);
    const secondSeed = chooseOrthogonalAxisSeed(firstEigen.axis);
    const secondEigen = powerIteratePrincipalAxis(deflated, secondSeed);
    const secondary = secondEigen?.axis ?? secondSeed;
    const tertiaryRaw = cross(firstEigen.axis, secondary);
    if (magnitude(tertiaryRaw) < EPSILON)
        return null;
    const tertiary = normalize(tertiaryRaw);
    const normalizedSecondary = normalize(cross(tertiary, firstEigen.axis));
    return {
        primary: normalize(firstEigen.axis),
        secondary: normalizedSecondary,
        tertiary,
    };
};
exports.resolvePrincipalAxesFromDirectionSamples = resolvePrincipalAxesFromDirectionSamples;
const resolveDirectionCandidates = (samples, principalAxes) => {
    const axes = [];
    const pushUnique = (axis) => {
        const normalized = normalize(axis);
        if (magnitude(normalized) < EPSILON)
            return;
        const duplicate = axes.some((existing) => Math.abs(dot(existing, normalized)) >= 0.95);
        if (!duplicate)
            axes.push(normalized);
    };
    if (principalAxes) {
        pushUnique(principalAxes.primary);
        pushUnique(principalAxes.secondary);
        pushUnique(principalAxes.tertiary);
    }
    const weightedOffset = [0, 0, 0];
    samples.forEach((sample) => {
        weightedOffset[0] += sample.offset[0] * sample.distance * sample.distance;
        weightedOffset[1] += sample.offset[1] * sample.distance * sample.distance;
        weightedOffset[2] += sample.offset[2] * sample.distance * sample.distance;
    });
    pushUnique(weightedOffset);
    return axes;
};
const scoreDirectionAxis = (axis, samples) => {
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
    if (span < EPSILON || totalSupport < EPSILON || maxDistance < EPSILON)
        return null;
    const extentAsymmetry = (maxFrontExtent - maxBackExtent) / span;
    const supportAsymmetry = (frontSupport - backSupport) / totalSupport;
    const combinedAsymmetry = 0.55 * extentAsymmetry + 0.45 * supportAsymmetry;
    const confidence = Math.abs(combinedAsymmetry) * Math.min(span / maxDistance, 1);
    if (!Number.isFinite(confidence) || confidence < 0.05)
        return null;
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
const resolveDirectionCueFromDirectionSamples = (samples) => {
    if (samples.length === 0)
        return null;
    const principalAxes = (0, exports.resolvePrincipalAxesFromDirectionSamples)(samples);
    const candidates = resolveDirectionCandidates(samples, principalAxes);
    let best = null;
    candidates.forEach((candidate) => {
        const cue = scoreDirectionAxis(candidate, samples);
        if (!cue)
            return;
        if (!best || cue.confidence > best.confidence) {
            best = cue;
        }
    });
    return best;
};
exports.resolveDirectionCueFromDirectionSamples = resolveDirectionCueFromDirectionSamples;
const resolveAxisSpanFromSamples = (samples, axis) => {
    let minProjection = Infinity;
    let maxProjection = -Infinity;
    samples.forEach((sample) => {
        const projection = dot(sample.offset, axis);
        if (projection < minProjection)
            minProjection = projection;
        if (projection > maxProjection)
            maxProjection = projection;
    });
    if (!Number.isFinite(minProjection) || !Number.isFinite(maxProjection))
        return 0;
    return maxProjection - minProjection;
};
const projectAxisOrthogonalToForward = (axis, forwardDirection) => {
    const projected = subtractProjection(axis, forwardDirection);
    if (magnitude(projected) < EPSILON)
        return null;
    return normalize(projected);
};
const orientAxisToReference = (axis, forwardDirection, upReference) => {
    const oriented = normalize(axis);
    const projectedReference = subtractProjection(upReference, forwardDirection);
    if (magnitude(projectedReference) < EPSILON)
        return oriented;
    const normalizedReference = normalize(projectedReference);
    return dot(oriented, normalizedReference) < 0
        ? [-oriented[0], -oriented[1], -oriented[2]]
        : oriented;
};
const resolveUpCueFromDirectionSamples = (samples, forwardDirection, upReference) => {
    if (samples.length === 0)
        return null;
    if (magnitude(forwardDirection) < EPSILON || magnitude(upReference) < EPSILON) {
        return null;
    }
    const forward = normalize(forwardDirection);
    const principalAxes = (0, exports.resolvePrincipalAxesFromDirectionSamples)(samples);
    if (!principalAxes)
        return null;
    const candidateAxes = [
        principalAxes.primary,
        principalAxes.secondary,
        principalAxes.tertiary,
    ];
    const projectedReference = projectAxisOrthogonalToForward(upReference, forward);
    let bestAxis = null;
    let bestScore = -Infinity;
    let bestSpan = 0;
    let maxSpan = 0;
    const candidates = candidateAxes
        .map((candidate) => {
        const projected = projectAxisOrthogonalToForward(candidate, forward);
        if (!projected)
            return null;
        const span = resolveAxisSpanFromSamples(samples, projected);
        maxSpan = Math.max(maxSpan, span);
        return { axis: projected, span };
    })
        .filter((candidate) => Boolean(candidate));
    if (candidates.length === 0)
        return null;
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
    if (!bestAxis)
        return null;
    return {
        axis: orientAxisToReference(bestAxis, forward, upReference),
        confidence: Math.max(0, Math.min(1, bestScore * 0.7 + bestSpan * 0.3)),
    };
};
exports.resolveUpCueFromDirectionSamples = resolveUpCueFromDirectionSamples;

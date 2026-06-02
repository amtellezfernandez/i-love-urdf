"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertJointValueWithPlan = exports.resolveJointValueConversionPlan = exports.JOINT_VALUE_CONVERSION_PARAMS = void 0;
exports.JOINT_VALUE_CONVERSION_PARAMS = {
    degToRad: Math.PI / 180,
    servoTicksLikelyAbsMax: 360,
    servoTickNeutral: 2048,
    servoTickFullScale: 2048,
    prismaticRangeExpansionThreshold: 1.5,
    normalizedInputLower: 0,
    normalizedInputUpper: 100,
    normalizedOutputLower: 0,
    normalizedOutputUpper: 1,
    rangeEpsilon: 1e-9,
};
const PLAN = {
    identity: { mode: "identity" },
    degreesToRadians: { mode: "degrees_to_radians" },
    servoTicksToRadians: { mode: "servo_ticks_to_radians" },
};
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const hasFiniteOrderedRange = (range) => Boolean(range && isFiniteNumber(range.min) && isFiniteNumber(range.max) && range.max >= range.min);
const clampUnit = (value) => Math.max(exports.JOINT_VALUE_CONVERSION_PARAMS.normalizedOutputLower, Math.min(exports.JOINT_VALUE_CONVERSION_PARAMS.normalizedOutputUpper, value));
const resolveTargetRange = (jointLimits, jointName) => {
    const limit = jointLimits?.[jointName];
    if (!limit || limit.type.toLowerCase() !== "prismatic")
        return null;
    if (!isFiniteNumber(limit.lower) || !isFiniteNumber(limit.upper) || limit.upper <= limit.lower) {
        return null;
    }
    return { lower: limit.lower, upper: limit.upper };
};
const needsPrismaticScaling = (rawRange, targetLower, targetUpper) => {
    const rawSpan = rawRange.max - rawRange.min;
    const targetSpan = targetUpper - targetLower;
    if (targetSpan <= exports.JOINT_VALUE_CONVERSION_PARAMS.rangeEpsilon)
        return false;
    const expansion = exports.JOINT_VALUE_CONVERSION_PARAMS.prismaticRangeExpansionThreshold;
    const maxRawAbs = Math.max(Math.abs(rawRange.min), Math.abs(rawRange.max));
    const maxTargetAbs = Math.max(Math.abs(targetLower), Math.abs(targetUpper), targetSpan);
    return ((rawSpan > exports.JOINT_VALUE_CONVERSION_PARAMS.rangeEpsilon && rawSpan > targetSpan * expansion) ||
        maxRawAbs > maxTargetAbs * expansion);
};
const resolveJointValueConversionPlan = ({ rawRange, targetJointName, jointLimits, angularConversionEnabled, }) => {
    if (!hasFiniteOrderedRange(rawRange)) {
        return angularConversionEnabled ? PLAN.degreesToRadians : PLAN.identity;
    }
    const prismaticTarget = resolveTargetRange(jointLimits, targetJointName);
    if (prismaticTarget) {
        return needsPrismaticScaling(rawRange, prismaticTarget.lower, prismaticTarget.upper)
            ? {
                mode: "linear_to_prismatic",
                rawMin: rawRange.min,
                rawMax: rawRange.max,
                targetLower: prismaticTarget.lower,
                targetUpper: prismaticTarget.upper,
            }
            : PLAN.identity;
    }
    if (!angularConversionEnabled)
        return PLAN.identity;
    const maxAbs = Math.max(Math.abs(rawRange.min), Math.abs(rawRange.max));
    return maxAbs > exports.JOINT_VALUE_CONVERSION_PARAMS.servoTicksLikelyAbsMax
        ? PLAN.servoTicksToRadians
        : PLAN.degreesToRadians;
};
exports.resolveJointValueConversionPlan = resolveJointValueConversionPlan;
const convertLinearToPrismatic = (rawValue, plan) => {
    const rawSpan = plan.rawMax - plan.rawMin;
    const normalized = rawSpan > exports.JOINT_VALUE_CONVERSION_PARAMS.rangeEpsilon
        ? (rawValue - plan.rawMin) / rawSpan
        : (rawValue - exports.JOINT_VALUE_CONVERSION_PARAMS.normalizedInputLower) /
            (exports.JOINT_VALUE_CONVERSION_PARAMS.normalizedInputUpper -
                exports.JOINT_VALUE_CONVERSION_PARAMS.normalizedInputLower);
    return plan.targetLower + clampUnit(normalized) * (plan.targetUpper - plan.targetLower);
};
const convertJointValueWithPlan = (rawValue, plan) => {
    if (plan.mode === "degrees_to_radians")
        return rawValue * exports.JOINT_VALUE_CONVERSION_PARAMS.degToRad;
    if (plan.mode === "servo_ticks_to_radians") {
        return (((rawValue - exports.JOINT_VALUE_CONVERSION_PARAMS.servoTickNeutral) /
            exports.JOINT_VALUE_CONVERSION_PARAMS.servoTickFullScale) *
            Math.PI);
    }
    return plan.mode === "linear_to_prismatic"
        ? convertLinearToPrismatic(rawValue, plan)
        : rawValue;
};
exports.convertJointValueWithPlan = convertJointValueWithPlan;

import type { JointLimits } from "../parsing/parseJointLimits";

export type JointValueRange = { min: number; max: number };

export type JointValueConversionPlan =
  | { mode: "identity" | "degrees_to_radians" | "servo_ticks_to_radians" }
  | { mode: "linear_to_prismatic"; rawMin: number; rawMax: number; targetLower: number; targetUpper: number };

export const JOINT_VALUE_CONVERSION_PARAMS = {
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
} as const;

const PLAN = {
  identity: { mode: "identity" },
  degreesToRadians: { mode: "degrees_to_radians" },
  servoTicksToRadians: { mode: "servo_ticks_to_radians" },
} satisfies Record<string, JointValueConversionPlan>;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const hasFiniteOrderedRange = (
  range: JointValueRange | null | undefined
): range is JointValueRange =>
  Boolean(range && isFiniteNumber(range.min) && isFiniteNumber(range.max) && range.max >= range.min);

const clampUnit = (value: number) =>
  Math.max(
    JOINT_VALUE_CONVERSION_PARAMS.normalizedOutputLower,
    Math.min(JOINT_VALUE_CONVERSION_PARAMS.normalizedOutputUpper, value)
  );

const resolveTargetRange = (jointLimits: JointLimits | undefined, jointName: string) => {
  const limit = jointLimits?.[jointName];
  if (!limit || limit.type.toLowerCase() !== "prismatic") return null;
  if (!isFiniteNumber(limit.lower) || !isFiniteNumber(limit.upper) || limit.upper <= limit.lower) {
    return null;
  }
  return { lower: limit.lower, upper: limit.upper };
};

const needsPrismaticScaling = (rawRange: JointValueRange, targetLower: number, targetUpper: number) => {
  const rawSpan = rawRange.max - rawRange.min;
  const targetSpan = targetUpper - targetLower;
  if (targetSpan <= JOINT_VALUE_CONVERSION_PARAMS.rangeEpsilon) return false;

  const expansion = JOINT_VALUE_CONVERSION_PARAMS.prismaticRangeExpansionThreshold;
  const maxRawAbs = Math.max(Math.abs(rawRange.min), Math.abs(rawRange.max));
  const maxTargetAbs = Math.max(Math.abs(targetLower), Math.abs(targetUpper), targetSpan);
  return (
    (rawSpan > JOINT_VALUE_CONVERSION_PARAMS.rangeEpsilon && rawSpan > targetSpan * expansion) ||
    maxRawAbs > maxTargetAbs * expansion
  );
};

export const resolveJointValueConversionPlan = ({
  rawRange,
  targetJointName,
  jointLimits,
  angularConversionEnabled,
}: {
  rawRange?: JointValueRange | null;
  targetJointName: string;
  jointLimits?: JointLimits;
  angularConversionEnabled: boolean;
}): JointValueConversionPlan => {
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

  if (!angularConversionEnabled) return PLAN.identity;
  const maxAbs = Math.max(Math.abs(rawRange.min), Math.abs(rawRange.max));
  return maxAbs > JOINT_VALUE_CONVERSION_PARAMS.servoTicksLikelyAbsMax
    ? PLAN.servoTicksToRadians
    : PLAN.degreesToRadians;
};

const convertLinearToPrismatic = (
  rawValue: number,
  plan: Extract<JointValueConversionPlan, { mode: "linear_to_prismatic" }>
) => {
  const rawSpan = plan.rawMax - plan.rawMin;
  const normalized =
    rawSpan > JOINT_VALUE_CONVERSION_PARAMS.rangeEpsilon
      ? (rawValue - plan.rawMin) / rawSpan
      : (rawValue - JOINT_VALUE_CONVERSION_PARAMS.normalizedInputLower) /
        (JOINT_VALUE_CONVERSION_PARAMS.normalizedInputUpper -
          JOINT_VALUE_CONVERSION_PARAMS.normalizedInputLower);
  return plan.targetLower + clampUnit(normalized) * (plan.targetUpper - plan.targetLower);
};

export const convertJointValueWithPlan = (
  rawValue: number,
  plan: JointValueConversionPlan
) => {
  if (plan.mode === "degrees_to_radians") return rawValue * JOINT_VALUE_CONVERSION_PARAMS.degToRad;
  if (plan.mode === "servo_ticks_to_radians") {
    return (
      ((rawValue - JOINT_VALUE_CONVERSION_PARAMS.servoTickNeutral) /
        JOINT_VALUE_CONVERSION_PARAMS.servoTickFullScale) *
      Math.PI
    );
  }
  return plan.mode === "linear_to_prismatic"
    ? convertLinearToPrismatic(rawValue, plan)
    : rawValue;
};

import { healthCheckUrdf, type HealthCheckReport } from "../analysis/healthCheckUrdf";
import { applyOrientationToRobot, type AxisSpec } from "../utils/rotateRobot";
import { canonicalOrderURDF } from "../utils/canonicalOrdering";
import { snapJointAxes, type AxisNormalizationResult } from "../utils/normalizeJointAxes";
import { prettyPrintURDF } from "../utils/prettyPrintURDF";
import {
  canonicalizeJointFrames,
  type CanonicalizeJointFrameResult,
} from "../transforms/canonicalizeJointFrames";

export interface NormalizeRobotOptions {
  apply?: boolean;
  snapAxes?: boolean;
  canonicalizeJointFrame?: boolean;
  targetJointAxis?: "x" | "y" | "z";
  sourceUpAxis?: AxisSpec;
  sourceForwardAxis?: AxisSpec;
  targetUpAxis?: AxisSpec;
  targetForwardAxis?: AxisSpec;
  prettyPrint?: boolean;
  canonicalOrder?: boolean;
  axisSnapTolerance?: number;
}

export interface NormalizeRobotPlannedStep {
  name: string;
  enabled: boolean;
  reason: string;
}

export interface NormalizeRobotResult {
  apply: boolean;
  plannedSteps: NormalizeRobotPlannedStep[];
  healthBefore: HealthCheckReport;
  healthAfter?: HealthCheckReport;
  normalization?: {
    normalizedAxes?: AxisNormalizationResult;
    snappedAxes?: AxisNormalizationResult;
    canonicalizedJointFrames?: CanonicalizeJointFrameResult;
  };
  outputUrdf?: string;
}

export function normalizeRobot(
  urdfContent: string,
  options: NormalizeRobotOptions = {}
): NormalizeRobotResult {
  const healthBefore = healthCheckUrdf(urdfContent, {
    axisSnapTolerance: options.axisSnapTolerance,
  });

  const plannedSteps: NormalizeRobotPlannedStep[] = [
    {
      name: "health-check",
      enabled: true,
      reason: "Always runs first to produce structural and physical findings.",
    },
    {
      name: "snap-axes",
      enabled: options.snapAxes ?? false,
      reason:
        options.snapAxes
          ? "Enabled explicitly."
          : "Disabled by default; enable when near-canonical axes should become exact basis vectors.",
    },
    {
      name: "apply-orientation",
      enabled: Boolean(options.sourceUpAxis && options.sourceForwardAxis),
      reason:
        options.sourceUpAxis && options.sourceForwardAxis
          ? "Source orientation was provided explicitly."
          : "No explicit source orientation was provided.",
    },
    {
      name: "canonicalize-joint-frame",
      enabled: options.canonicalizeJointFrame ?? false,
      reason:
        options.canonicalizeJointFrame
          ? `Enabled explicitly with target axis ${options.targetJointAxis ?? "z"}.`
          : "Disabled by default; enable when simulator control expects a canonical joint-local axis.",
    },
    {
      name: "pretty-print",
      enabled: options.prettyPrint ?? false,
      reason: options.prettyPrint ? "Enabled explicitly." : "Disabled by default.",
    },
    {
      name: "canonical-order",
      enabled: options.canonicalOrder ?? false,
      reason: options.canonicalOrder ? "Enabled explicitly." : "Disabled by default.",
    },
  ];

  if (!options.apply) {
    return {
      apply: false,
      plannedSteps,
      healthBefore,
    };
  }

  let current = urdfContent;
  const normalization: NormalizeRobotResult["normalization"] = {};

  if (options.snapAxes) {
    const snapped = snapJointAxes(current, {
      snapTolerance: options.axisSnapTolerance,
    });
    normalization.snappedAxes = snapped;
    current = snapped.urdfContent;
  }

  if (options.sourceUpAxis && options.sourceForwardAxis) {
    current = applyOrientationToRobot(current, {
      sourceUpAxis: options.sourceUpAxis,
      sourceForwardAxis: options.sourceForwardAxis,
      targetUpAxis: options.targetUpAxis ?? "+z",
      targetForwardAxis: options.targetForwardAxis ?? "+x",
    });
  }

  if (options.canonicalizeJointFrame) {
    const canonicalized = canonicalizeJointFrames(current, {
      targetAxis: options.targetJointAxis ?? "z",
    });
    normalization.canonicalizedJointFrames = canonicalized;
    current = canonicalized.content;
  }

  if (options.prettyPrint) {
    current = prettyPrintURDF(current, 2);
  }

  if (options.canonicalOrder) {
    current = canonicalOrderURDF(current);
  }

  return {
    apply: true,
    plannedSteps,
    healthBefore,
    healthAfter: healthCheckUrdf(current, {
      axisSnapTolerance: options.axisSnapTolerance,
    }),
    normalization,
    outputUrdf: current,
  };
}

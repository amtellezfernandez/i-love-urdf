import { guessUrdfOrientation } from "./guessOrientation";
import { parseURDF } from "../parsing/urdfParser";
import { validateUrdf, type UrdfValidationIssue } from "../validation/validateUrdf";

export type HealthCheckLevel = "error" | "warning" | "info";

export interface HealthCheckFinding {
  level: HealthCheckLevel;
  code: string;
  message: string;
  context?: string;
  suggestion?: string;
}

export interface HealthCheckOptions {
  axisSnapTolerance?: number;
  includeOrientation?: boolean;
}

export interface HealthCheckReport {
  ok: boolean;
  findings: HealthCheckFinding[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  orientationGuess?: ReturnType<typeof guessUrdfOrientation>;
}

const DEFAULT_AXIS_SNAP_TOLERANCE = 1e-3;
const AXIS_EPSILON = 1e-6;

const toFinding = (issue: UrdfValidationIssue): HealthCheckFinding => ({
  level: issue.level,
  code: issue.level === "error" ? "structural-error" : "structural-warning",
  message: issue.message,
  context: issue.context,
});

const parseTriplet = (raw: string | null): [number, number, number] | null => {
  if (!raw) return null;
  const values = raw.trim().split(/\s+/).map((value) => Number(value));
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return [values[0], values[1], values[2]];
};

const magnitude = (vector: [number, number, number]): number =>
  Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);

const normalize = (vector: [number, number, number]): [number, number, number] => {
  const length = magnitude(vector);
  if (length < AXIS_EPSILON) {
    return vector;
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

const distanceToCanonical = (vector: [number, number, number]): number => {
  const canonical: Array<[number, number, number]> = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  return Math.min(
    ...canonical.map((candidate) =>
      Math.sqrt(
        (vector[0] - candidate[0]) * (vector[0] - candidate[0]) +
          (vector[1] - candidate[1]) * (vector[1] - candidate[1]) +
          (vector[2] - candidate[2]) * (vector[2] - candidate[2])
      )
    )
  );
};

const countSummary = (findings: HealthCheckFinding[]) => ({
  errors: findings.filter((finding) => finding.level === "error").length,
  warnings: findings.filter((finding) => finding.level === "warning").length,
  infos: findings.filter((finding) => finding.level === "info").length,
});

export function healthCheckUrdf(
  urdfContent: string,
  options: HealthCheckOptions = {}
): HealthCheckReport {
  const axisSnapTolerance = options.axisSnapTolerance ?? DEFAULT_AXIS_SNAP_TOLERANCE;
  const findings: HealthCheckFinding[] = [];

  const validation = validateUrdf(urdfContent);
  findings.push(...validation.issues.map(toFinding));

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    const summary = countSummary(findings);
    return {
      ok: summary.errors === 0,
      findings,
      summary,
    };
  }

  const robot = parsed.document.querySelector("robot");
  if (!robot) {
    findings.push({
      level: "error",
      code: "missing-robot",
      message: "No <robot> element found in URDF.",
    });
    const summary = countSummary(findings);
    return {
      ok: summary.errors === 0,
      findings,
      summary,
    };
  }

  Array.from(robot.querySelectorAll(":scope > link")).forEach((link) => {
    const linkName = link.getAttribute("name") || "unnamed";
    const inertial = Array.from(link.children).find((child) => child.tagName === "inertial") ?? null;
    if (!inertial) {
      return;
    }

    const mass = inertial.querySelector("mass");
    const inertia = inertial.querySelector("inertia");
    const massValue = Number(mass?.getAttribute("value") || "");
    if (!Number.isFinite(massValue) || massValue <= 0) {
      findings.push({
        level: "error",
        code: "invalid-mass",
        context: linkName,
        message: `Link "${linkName}" has a missing or non-positive inertial mass.`,
      });
    }

    if (!inertia) {
      findings.push({
        level: "warning",
        code: "missing-inertia",
        context: linkName,
        message: `Link "${linkName}" has <inertial> data but no <inertia> tensor.`,
      });
      return;
    }

    const ixx = Number(inertia.getAttribute("ixx") || "");
    const ixy = Number(inertia.getAttribute("ixy") || "0");
    const ixz = Number(inertia.getAttribute("ixz") || "0");
    const iyy = Number(inertia.getAttribute("iyy") || "");
    const iyz = Number(inertia.getAttribute("iyz") || "0");
    const izz = Number(inertia.getAttribute("izz") || "");

    if (![ixx, ixy, ixz, iyy, iyz, izz].every((value) => Number.isFinite(value))) {
      findings.push({
        level: "error",
        code: "invalid-inertia-numbers",
        context: linkName,
        message: `Link "${linkName}" has invalid inertial tensor numbers.`,
      });
      return;
    }

    if (ixx <= 0 || iyy <= 0 || izz <= 0) {
      findings.push({
        level: "error",
        code: "non-positive-inertia-diagonal",
        context: linkName,
        message: `Link "${linkName}" has non-positive principal inertia values.`,
      });
    }

    if (ixx > iyy + izz + 1e-9 || iyy > ixx + izz + 1e-9 || izz > ixx + iyy + 1e-9) {
      findings.push({
        level: "error",
        code: "triangle-inequality",
        context: linkName,
        message: `Link "${linkName}" violates inertia triangle inequalities.`,
      });
    }

    const principalMinor = ixx * iyy - ixy * ixy;
    const determinant =
      ixx * (iyy * izz - iyz * iyz) -
      ixy * (ixy * izz - iyz * ixz) +
      ixz * (ixy * iyz - iyy * ixz);
    if (principalMinor < -1e-9 || determinant < -1e-9) {
      findings.push({
        level: "error",
        code: "non-psd-inertia",
        context: linkName,
        message: `Link "${linkName}" has an inertial tensor that is not positive semidefinite.`,
      });
    }

    if (Number.isFinite(massValue) && massValue > 0 && Math.max(ixx, iyy, izz) < 1e-10 && massValue > 1e-6) {
      findings.push({
        level: "warning",
        code: "near-zero-inertia",
        context: linkName,
        message: `Link "${linkName}" has a nontrivial mass but near-zero inertia values.`,
      });
    }
  });

  Array.from(robot.querySelectorAll(":scope > joint")).forEach((joint) => {
    const jointName = joint.getAttribute("name") || "unnamed";
    const jointType = joint.getAttribute("type") || "unknown";
    if (jointType === "fixed" || jointType === "floating" || jointType === "planar") {
      return;
    }

    const axisElement = joint.querySelector("axis");
    const axisValue = axisElement?.getAttribute("xyz") || "1 0 0";
    const axis = parseTriplet(axisValue);
    if (!axis) {
      findings.push({
        level: "error",
        code: "invalid-axis-format",
        context: jointName,
        message: `Joint "${jointName}" has an invalid axis format.`,
        suggestion: "Run i-love-urdf snap-axes --urdf robot.urdf --out robot.fixed.urdf",
      });
      return;
    }

    const axisMagnitude = magnitude(axis);
    if (axisMagnitude < AXIS_EPSILON) {
      findings.push({
        level: "error",
        code: "zero-axis",
        context: jointName,
        message: `Joint "${jointName}" has a zero or near-zero axis vector.`,
        suggestion: "Run i-love-urdf set-joint-axis --urdf robot.urdf --joint JOINT --xyz \"0 0 1\" --out robot.fixed.urdf",
      });
      return;
    }

    if (Math.abs(axisMagnitude - 1) > 1e-3) {
      findings.push({
        level: "warning",
        code: "non-unit-axis",
        context: jointName,
        message: `Joint "${jointName}" axis is not unit length (magnitude ${axisMagnitude.toFixed(4)}).`,
        suggestion: "Run i-love-urdf normalize-axes --urdf robot.urdf --out robot.normalized.urdf",
      });
    }

    const normalizedAxis = normalize(axis);
    if (distanceToCanonical(normalizedAxis) <= axisSnapTolerance) {
      findings.push({
        level: "info",
        code: "snap-axis-candidate",
        context: jointName,
        message: `Joint "${jointName}" axis is close to a canonical basis vector and can be snapped safely.`,
        suggestion: "Run i-love-urdf snap-axes --urdf robot.urdf --out robot.snapped.urdf",
      });
    }
  });

  let orientationGuess: ReturnType<typeof guessUrdfOrientation> | undefined;
  if (options.includeOrientation !== false) {
    orientationGuess = guessUrdfOrientation(urdfContent);
    findings.push({
      level: "info",
      code: "orientation-guess",
      message: `Guessed orientation: up ${orientationGuess.likelyUpDirection ?? orientationGuess.likelyUpAxis}, forward ${orientationGuess.likelyForwardDirection ?? orientationGuess.likelyForwardAxis}.`,
      suggestion:
        orientationGuess.suggestedApplyOrientation.command ||
        "Run i-love-urdf guess-orientation --urdf robot.urdf for a detailed evidence report.",
    });
  }

  const summary = countSummary(findings);
  return {
    ok: summary.errors === 0,
    findings,
    summary,
    orientationGuess,
  };
}

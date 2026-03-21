import { parseURDF, serializeURDF } from "../parsing/urdfParser";

export interface AxisNormalizationOptions {
  epsilon?: number;
  defaultAxis?: [number, number, number];
  snapToCanonical?: boolean;
  snapTolerance?: number;
}

export interface AxisCorrection {
  jointName: string;
  jointType: string;
  original: string;
  corrected: string;
  reason: string;
}

export interface AxisError {
  jointName: string;
  jointType: string;
  issue: string;
}

export interface AxisNormalizationResult {
  urdfContent: string;
  corrections: AxisCorrection[];
  errors: AxisError[];
  snapped: AxisCorrection[];
}

export type JointAxisInput =
  | [number, number, number]
  | { x: number; y: number; z: number }
  | string;

const DEFAULT_EPSILON = 1e-6;
const DEFAULT_SNAP_TOLERANCE = 1e-3;
const DEFAULT_AXIS: [number, number, number] = [1, 0, 0];

const CANONICAL_AXES: Array<{ label: string; vector: [number, number, number] }> = [
  { label: "1 0 0", vector: [1, 0, 0] },
  { label: "-1 0 0", vector: [-1, 0, 0] },
  { label: "0 1 0", vector: [0, 1, 0] },
  { label: "0 -1 0", vector: [0, -1, 0] },
  { label: "0 0 1", vector: [0, 0, 1] },
  { label: "0 0 -1", vector: [0, 0, -1] },
];

function parseAxis(axisStr: string): [number, number, number] | null {
  const parts = axisStr.trim().split(/\s+/);
  if (parts.length !== 3) return null;

  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return [values[0], values[1], values[2]];
}

const coerceAxisInput = (axis: JointAxisInput): [number, number, number] | null => {
  if (typeof axis === "string") {
    return parseAxis(axis);
  }
  if (Array.isArray(axis)) {
    return axis.length === 3 ? [Number(axis[0]), Number(axis[1]), Number(axis[2])] : null;
  }
  if (axis && typeof axis === "object") {
    return [Number(axis.x), Number(axis.y), Number(axis.z)];
  }
  return null;
};

function magnitude(vec: [number, number, number]): number {
  return Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);
}

function normalize(vec: [number, number, number]): [number, number, number] {
  const mag = magnitude(vec);
  if (mag === 0) return vec;
  return [vec[0] / mag, vec[1] / mag, vec[2] / mag];
}

function epsilonClamp(vec: [number, number, number], epsilon: number): [number, number, number] {
  return [
    Math.abs(vec[0]) < epsilon ? 0 : vec[0],
    Math.abs(vec[1]) < epsilon ? 0 : vec[1],
    Math.abs(vec[2]) < epsilon ? 0 : vec[2],
  ];
}

function formatAxis(vec: [number, number, number]): string {
  return vec
    .map((value) => (value === 0 ? "0" : value.toFixed(10).replace(/\.?0+$/, "")))
    .join(" ");
}

function distance(left: [number, number, number], right: [number, number, number]): number {
  return Math.sqrt(
    (left[0] - right[0]) * (left[0] - right[0]) +
      (left[1] - right[1]) * (left[1] - right[1]) +
      (left[2] - right[2]) * (left[2] - right[2])
  );
}

function findCanonicalSnapTarget(
  normalizedAxis: [number, number, number],
  snapTolerance: number
): [number, number, number] | null {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestTarget: [number, number, number] | null = null;

  for (const candidate of CANONICAL_AXES) {
    const candidateDistance = distance(normalizedAxis, candidate.vector);
    if (candidateDistance <= snapTolerance && candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestTarget = candidate.vector;
    }
  }

  return bestTarget;
}

export function normalizeJointAxis(
  axis: JointAxisInput,
  options: AxisNormalizationOptions = {}
): [number, number, number] {
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const defaultAxis = options.defaultAxis ?? DEFAULT_AXIS;
  const snapTolerance = options.snapTolerance ?? DEFAULT_SNAP_TOLERANCE;
  const snapToCanonical = options.snapToCanonical ?? false;

  const parsedAxis = coerceAxisInput(axis);
  if (!parsedAxis || parsedAxis.some((value) => !Number.isFinite(value))) {
    return defaultAxis;
  }

  const mag = magnitude(parsedAxis);
  if (mag < epsilon) {
    return defaultAxis;
  }

  let correctedAxis = normalize(parsedAxis);
  correctedAxis = epsilonClamp(correctedAxis, epsilon);
  const reNormalizedMagnitude = magnitude(correctedAxis);
  if (reNormalizedMagnitude > epsilon) {
    correctedAxis = normalize(correctedAxis);
  }

  if (snapToCanonical) {
    const snapTarget = findCanonicalSnapTarget(correctedAxis, snapTolerance);
    if (snapTarget) {
      correctedAxis = snapTarget;
    }
  }

  return correctedAxis;
}

export function normalizeJointAxes(
  urdfContent: string,
  options: AxisNormalizationOptions = {}
): AxisNormalizationResult {
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const defaultAxis = options.defaultAxis ?? DEFAULT_AXIS;
  const snapTolerance = options.snapTolerance ?? DEFAULT_SNAP_TOLERANCE;
  const snapToCanonical = options.snapToCanonical ?? false;

  const parsed = parseURDF(urdfContent);
  const result: AxisNormalizationResult = {
    urdfContent,
    corrections: [],
    errors: [],
    snapped: [],
  };

  if (!parsed.isValid) {
    result.errors.push({
      jointName: "N/A",
      jointType: "N/A",
      issue: parsed.error || "Invalid URDF - cannot parse",
    });
    return result;
  }

  const robot = parsed.document.querySelector("robot");
  if (!robot) {
    result.errors.push({
      jointName: "N/A",
      jointType: "N/A",
      issue: "No <robot> element found",
    });
    return result;
  }

  const defaultAxisString = formatAxis(defaultAxis);
  const joints = Array.from(robot.querySelectorAll("joint"));
  for (const joint of joints) {
    const jointName = joint.getAttribute("name") || "unnamed";
    const jointType = joint.getAttribute("type") || "unknown";

    if (jointType === "fixed" || jointType === "floating" || jointType === "planar") {
      continue;
    }

    let axisElement = joint.querySelector("axis");
    const currentAxisAttr = axisElement?.getAttribute("xyz") || defaultAxisString;
    const parsedAxis = parseAxis(currentAxisAttr);

    if (!parsedAxis) {
      result.errors.push({
        jointName,
        jointType,
        issue: `Invalid axis format: "${currentAxisAttr}"`,
      });

      if (!axisElement) {
        axisElement = parsed.document.createElement("axis");
        joint.appendChild(axisElement);
      }
      axisElement.setAttribute("xyz", defaultAxisString);
      result.corrections.push({
        jointName,
        jointType,
        original: currentAxisAttr,
        corrected: defaultAxisString,
        reason: "Invalid format - using default axis",
      });
      continue;
    }

    const mag = magnitude(parsedAxis);
    if (mag < epsilon) {
      result.errors.push({
        jointName,
        jointType,
        issue: `Zero or near-zero axis vector: "${currentAxisAttr}"`,
      });

      if (!axisElement) {
        axisElement = parsed.document.createElement("axis");
        joint.appendChild(axisElement);
      }
      axisElement.setAttribute("xyz", defaultAxisString);
      result.corrections.push({
        jointName,
        jointType,
        original: currentAxisAttr,
        corrected: defaultAxisString,
        reason: "Zero vector - using default axis",
      });
      continue;
    }

    let correctedAxis = normalizeJointAxis(parsedAxis, {
      epsilon,
      defaultAxis,
      snapTolerance,
      snapToCanonical,
    });

    let correctionReason =
      Math.abs(mag - 1.0) > epsilon
        ? `Non-unit vector (magnitude: ${mag.toFixed(4)})`
        : "Cleaned up floating point precision";

    if (snapToCanonical) {
      const snapTarget = findCanonicalSnapTarget(correctedAxis, snapTolerance);
      if (snapTarget) {
        correctionReason = `Snapped near-canonical axis within tolerance ${snapTolerance}`;
      }
    }

    const correctedStr = formatAxis(correctedAxis);
    const originalNormalized = formatAxis(epsilonClamp(parsedAxis, epsilon));
    const changed = correctedStr !== originalNormalized || Math.abs(mag - 1.0) > epsilon;
    if (!changed) {
      continue;
    }

    if (!axisElement) {
      axisElement = parsed.document.createElement("axis");
      joint.appendChild(axisElement);
    }
    axisElement.setAttribute("xyz", correctedStr);

    const correction: AxisCorrection = {
      jointName,
      jointType,
      original: currentAxisAttr,
      corrected: correctedStr,
      reason: correctionReason,
    };
    result.corrections.push(correction);
    if (correctionReason.startsWith("Snapped near-canonical axis")) {
      result.snapped.push(correction);
    }
  }

  result.urdfContent = serializeURDF(parsed.document);
  return result;
}

export function snapJointAxes(
  urdfContent: string,
  options: Omit<AxisNormalizationOptions, "snapToCanonical"> = {}
): AxisNormalizationResult {
  return normalizeJointAxes(urdfContent, {
    ...options,
    snapToCanonical: true,
  });
}

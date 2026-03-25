import { parseXml, serializeXml } from "../xmlDom";
import {
  applyRotationToElementOrigin,
  createRotation90Degrees,
  cross,
  matrixFromColumns,
  multiplyMatrices,
  multiplyMatrixVector,
  normalizeVector,
  parseXyz,
  rotateInertiaTensorElement,
  transpose,
  type Mat3,
  type Vec3,
} from "./rotationMath";

export type AxisSpec =
  | "x"
  | "y"
  | "z"
  | "+x"
  | "+y"
  | "+z"
  | "-x"
  | "-y"
  | "-z";

function axisSpecToVector(axis: AxisSpec): Vec3 {
  const normalized = axis.startsWith("+") || axis.startsWith("-") ? axis.slice(1) : axis;
  const sign = axis.startsWith("-") ? -1 : 1;
  switch (normalized) {
    case "x":
      return [sign, 0, 0];
    case "y":
      return [0, sign, 0];
    case "z":
      return [0, 0, sign];
    default:
      return [1, 0, 0];
  }
}

function basisFromForwardUp(forwardAxis: AxisSpec, upAxis: AxisSpec): Mat3 {
  const forward = normalizeVector(axisSpecToVector(forwardAxis));
  const up = normalizeVector(axisSpecToVector(upAxis));
  const dot = forward[0] * up[0] + forward[1] * up[1] + forward[2] * up[2];
  if (Math.abs(dot) > 1e-9) {
    throw new Error(`Forward axis ${forwardAxis} must be orthogonal to up axis ${upAxis}.`);
  }
  const lateral = normalizeVector(cross(up, forward));
  return matrixFromColumns(forward, lateral, up);
}

export function buildOrientationMappingRotation(options: {
  sourceForwardAxis: AxisSpec;
  sourceUpAxis: AxisSpec;
  targetForwardAxis?: AxisSpec;
  targetUpAxis?: AxisSpec;
}): Mat3 {
  const sourceBasis = basisFromForwardUp(options.sourceForwardAxis, options.sourceUpAxis);
  const targetBasis = basisFromForwardUp(
    options.targetForwardAxis ?? "x",
    options.targetUpAxis ?? "z"
  );
  return multiplyMatrices(targetBasis, transpose(sourceBasis));
}

export function applyGlobalRotation(urdfContent: string, R: Mat3): string {
  const xmlDoc = parseXml(urdfContent);

  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error(parserError.textContent || "URDF XML parse error");
  }

  const robot = xmlDoc.querySelector("robot");
  if (!robot) {
    throw new Error("No <robot> element found in URDF");
  }

  const RT = transpose(R);

  xmlDoc.querySelectorAll("link").forEach((link) => {
    link.querySelectorAll("visual").forEach((visual) => {
      applyRotationToElementOrigin(visual, R, RT);
    });

    link.querySelectorAll("collision").forEach((collision) => {
      applyRotationToElementOrigin(collision, R, RT);
    });

    const inertial = link.querySelector("inertial");
    if (inertial) {
      applyRotationToElementOrigin(inertial, R, RT);
      const inertia = inertial.querySelector("inertia");
      if (inertia) {
        rotateInertiaTensorElement(inertia, R);
      }
    }
  });

  xmlDoc.querySelectorAll("joint").forEach((joint) => {
    applyRotationToElementOrigin(joint, R, RT);

    const axisElement = joint.querySelector("axis");
    if (axisElement) {
      const axisXyz = parseXyz(axisElement.getAttribute("xyz"));
      const rotatedAxis = normalizeVector(multiplyMatrixVector(R, axisXyz));
      axisElement.setAttribute(
        "xyz",
        `${rotatedAxis[0].toFixed(6)} ${rotatedAxis[1].toFixed(6)} ${rotatedAxis[2].toFixed(6)}`
      );
    }
  });

  return serializeXml(xmlDoc);
}

export function applyOrientationToRobot(
  urdfContent: string,
  options: {
    sourceForwardAxis: AxisSpec;
    sourceUpAxis: AxisSpec;
    targetForwardAxis?: AxisSpec;
    targetUpAxis?: AxisSpec;
  }
): string {
  const rotation = buildOrientationMappingRotation(options);
  return applyGlobalRotation(urdfContent, rotation);
}

export function rotateRobot90Degrees(urdfContent: string, axis: "x" | "y" | "z"): string {
  const R = createRotation90Degrees(axis);
  return applyGlobalRotation(urdfContent, R);
}

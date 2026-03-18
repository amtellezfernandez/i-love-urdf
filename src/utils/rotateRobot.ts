/**
 * Rotate the robot base frame while preserving the internal kinematic tree.
 *
 * This works by rotating:
 * - each root link's visual / collision / inertial data
 * - joints whose parent is a root link
 *
 * Deeper joints and link-local geometry remain unchanged because their frames
 * move consistently with the rotated root subtree.
 */

import { parseXml, serializeXml } from "../xmlDom";

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

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

// Convert RPY (roll-pitch-yaw in radians) to rotation matrix
function rpyToMatrix(rpy: { r: number; p: number; y: number }): Mat3 {
  const [r, p, y] = [rpy.r, rpy.p, rpy.y];
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cy = Math.cos(y);
  const sy = Math.sin(y);

  return [
    [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
    [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
    [-sp, cp * sr, cp * cr],
  ];
}

// Convert rotation matrix to RPY (roll-pitch-yaw in radians)
function matrixToRpy(matrix: Mat3): { r: number; p: number; y: number } {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = matrix;

  // Handle gimbal lock
  if (Math.abs(m20) >= 1) {
    const r = 0;
    const p = m20 > 0 ? Math.PI / 2 : -Math.PI / 2;
    const y = r + Math.atan2(m01, m00);
    return { r, p, y };
  }

  const p = -Math.asin(m20);
  const cp = Math.cos(p);
  const r = Math.atan2(m21 / cp, m22 / cp);
  const y = Math.atan2(m10 / cp, m00 / cp);

  return { r, p, y };
}

// Matrix multiplication: A * B
function multiplyMatrices(A: Mat3, B: Mat3): Mat3 {
  const result: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      for (let k = 0; k < 3; k += 1) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

// Matrix * vector: R * v
function multiplyMatrixVector(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

// Matrix transpose
function transpose(matrix: Mat3): Mat3 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

// Create 90-degree rotation matrix around axis
function createRotation90Degrees(axis: "x" | "y" | "z"): Mat3 {
  const angle = Math.PI / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  switch (axis) {
    case "x":
      return [
        [1, 0, 0],
        [0, c, -s],
        [0, s, c],
      ];
    case "y":
      return [
        [c, 0, s],
        [0, 1, 0],
        [-s, 0, c],
      ];
    case "z":
      return [
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1],
      ];
  }
}

// Normalize vector
function normalize(vector: Vec3): Vec3 {
  const length = Math.sqrt(
    vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]
  );
  if (length < 1e-10) return vector;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

// Parse xyz attribute to array
function parseXyz(attr: string | null): Vec3 {
  if (!attr) return [0, 0, 0];
  const parts = attr.trim().split(/\s+/).map(parseFloat);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// Parse rpy attribute to object
function parseRpy(attr: string | null): { r: number; p: number; y: number } {
  if (!attr) return { r: 0, p: 0, y: 0 };
  const parts = attr.trim().split(/\s+/).map(parseFloat);
  return { r: parts[0] || 0, p: parts[1] || 0, y: parts[2] || 0 };
}

// Format array as xyz string
function formatXyz(xyz: Vec3): string {
  return `${xyz[0].toFixed(6)} ${xyz[1].toFixed(6)} ${xyz[2].toFixed(6)}`;
}

// Format RPY as string
function formatRpy(rpy: { r: number; p: number; y: number }): string {
  return `${rpy.r.toFixed(6)} ${rpy.p.toFixed(6)} ${rpy.y.toFixed(6)}`;
}

// Ensure origin element exists, create if missing
function ensureOrigin(element: Element): Element {
  let origin = element.querySelector("origin");
  if (!origin) {
    origin = element.ownerDocument!.createElement("origin");
    origin.setAttribute("xyz", "0 0 0");
    origin.setAttribute("rpy", "0 0 0");
    element.insertBefore(origin, element.firstChild);
  }
  return origin;
}

// Rotate inertia tensor: I' = R * I * R^T
function rotateInertia(inertia: Element, R: Mat3): void {
  const ixx = parseFloat(inertia.getAttribute("ixx") || "0");
  const ixy = parseFloat(inertia.getAttribute("ixy") || "0");
  const ixz = parseFloat(inertia.getAttribute("ixz") || "0");
  const iyy = parseFloat(inertia.getAttribute("iyy") || "0");
  const iyz = parseFloat(inertia.getAttribute("iyz") || "0");
  const izz = parseFloat(inertia.getAttribute("izz") || "0");

  // Construct 3x3 inertia matrix
  const I: Mat3 = [
    [ixx, ixy, ixz],
    [ixy, iyy, iyz],
    [ixz, iyz, izz],
  ];

  // Rotate: I' = R * I * R^T
  const RT = transpose(R);
  const IRotated = multiplyMatrices(multiplyMatrices(R, I), RT);

  // Extract components (symmetric matrix)
  inertia.setAttribute("ixx", IRotated[0][0].toFixed(6));
  inertia.setAttribute("ixy", IRotated[0][1].toFixed(6));
  inertia.setAttribute("ixz", IRotated[0][2].toFixed(6));
  inertia.setAttribute("iyy", IRotated[1][1].toFixed(6));
  inertia.setAttribute("iyz", IRotated[1][2].toFixed(6));
  inertia.setAttribute("izz", IRotated[2][2].toFixed(6));
}

function axisSpecToVector(axis: AxisSpec): Vec3 {
  const normalized = axis.startsWith("+") ? axis.slice(1) : axis;
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

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function matrixFromColumns(first: Vec3, second: Vec3, third: Vec3): Mat3 {
  return [
    [first[0], second[0], third[0]],
    [first[1], second[1], third[1]],
    [first[2], second[2], third[2]],
  ];
}

function basisFromForwardUp(forwardAxis: AxisSpec, upAxis: AxisSpec): Mat3 {
  const forward = normalize(axisSpecToVector(forwardAxis));
  const up = normalize(axisSpecToVector(upAxis));
  const dot = forward[0] * up[0] + forward[1] * up[1] + forward[2] * up[2];
  if (Math.abs(dot) > 1e-9) {
    throw new Error(`Forward axis ${forwardAxis} must be orthogonal to up axis ${upAxis}.`);
  }
  const lateral = normalize(cross(up, forward));
  return matrixFromColumns(forward, lateral, up);
}

export function buildOrientationMappingRotation(options: {
  sourceForwardAxis: AxisSpec;
  sourceUpAxis: AxisSpec;
  targetForwardAxis?: AxisSpec;
  targetUpAxis?: AxisSpec;
}): Mat3 {
  const sourceBasis = basisFromForwardUp(
    options.sourceForwardAxis,
    options.sourceUpAxis
  );
  const targetBasis = basisFromForwardUp(
    options.targetForwardAxis ?? "x",
    options.targetUpAxis ?? "z"
  );
  return multiplyMatrices(targetBasis, transpose(sourceBasis));
}

function findRootLinks(xmlDoc: Document): Element[] {
  const allJoints = xmlDoc.querySelectorAll("joint");
  const childLinks = new Set<string>();
  allJoints.forEach((joint) => {
    const child = joint.querySelector("child")?.getAttribute("link");
    if (child) childLinks.add(child);
  });

  return Array.from(xmlDoc.querySelectorAll("link")).filter((link) => {
    const linkName = link.getAttribute("name");
    return Boolean(linkName && !childLinks.has(linkName));
  });
}

function applyRotationToElementOrigin(element: Element, R: Mat3, RT: Mat3): void {
  const origin = ensureOrigin(element);
  const xyz = parseXyz(origin.getAttribute("xyz"));
  const rpy = parseRpy(origin.getAttribute("rpy"));

  const rotatedXyz = multiplyMatrixVector(R, xyz);
  const localR = rpyToMatrix(rpy);
  const rotatedR = multiplyMatrices(R, multiplyMatrices(localR, RT));
  const rotatedRpy = matrixToRpy(rotatedR);

  origin.setAttribute("xyz", formatXyz(rotatedXyz));
  origin.setAttribute("rpy", formatRpy(rotatedRpy));
}

function applyRotationMatrixToRobotBase(urdfContent: string, R: Mat3): string {
  const xmlDoc = parseXml(urdfContent);

  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    const errorText = parserError.textContent || "Unknown XML parsing error";
    console.error("URDF parsing error:", errorText);
    return urdfContent;
  }

  const robot = xmlDoc.querySelector("robot");
  if (!robot) {
    console.error("No <robot> element found in URDF");
    return urdfContent;
  }

  const rootLinks = findRootLinks(xmlDoc);
  if (rootLinks.length === 0) {
    console.error("Could not find root link");
    return urdfContent;
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
        rotateInertia(inertia, R);
      }
    }
  });

  xmlDoc.querySelectorAll("joint").forEach((joint) => {
    applyRotationToElementOrigin(joint, R, RT);

    const axisElement = joint.querySelector("axis");
    if (axisElement) {
      const axisXyz = parseXyz(axisElement.getAttribute("xyz"));
      const rotatedAxis = normalize(multiplyMatrixVector(R, axisXyz));
      axisElement.setAttribute("xyz", formatXyz(rotatedAxis));
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
  return applyRotationMatrixToRobotBase(urdfContent, rotation);
}

/**
 * Rotates the root link and its direct child joints by 90 degrees around the specified axis.
 */
export function rotateRobot90Degrees(urdfContent: string, axis: "x" | "y" | "z"): string {
  const R = createRotation90Degrees(axis);
  return applyRotationMatrixToRobotBase(urdfContent, R);
}

/**
 * Rotate the root link and its direct child joints by 90 degrees.
 * This maintains the relative structure while rotating the base frame.
 */

import { parseXml, serializeXml } from "../xmlDom";

// Convert RPY (roll-pitch-yaw in radians) to rotation matrix
function rpyToMatrix(rpy: { r: number; p: number; y: number }): number[][] {
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
function matrixToRpy(matrix: number[][]): { r: number; p: number; y: number } {
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
function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [
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
function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

// Matrix transpose
function transpose(matrix: number[][]): number[][] {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

// Create 90-degree rotation matrix around axis
function createRotation90Degrees(axis: "x" | "y" | "z"): number[][] {
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
function normalize(vector: number[]): number[] {
  const length = Math.sqrt(
    vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]
  );
  if (length < 1e-10) return vector;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

// Parse xyz attribute to array
function parseXyz(attr: string | null): number[] {
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
function formatXyz(xyz: number[]): string {
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
function rotateInertia(inertia: Element, R: number[][]): void {
  const ixx = parseFloat(inertia.getAttribute("ixx") || "0");
  const ixy = parseFloat(inertia.getAttribute("ixy") || "0");
  const ixz = parseFloat(inertia.getAttribute("ixz") || "0");
  const iyy = parseFloat(inertia.getAttribute("iyy") || "0");
  const iyz = parseFloat(inertia.getAttribute("iyz") || "0");
  const izz = parseFloat(inertia.getAttribute("izz") || "0");

  // Construct 3x3 inertia matrix
  const I = [
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

/**
 * Rotates the root link and its direct child joints by 90 degrees around the specified axis.
 */
export function rotateRobot90Degrees(urdfContent: string, axis: "x" | "y" | "z"): string {
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

  // Find root link (link that never appears as a child)
  const allJoints = xmlDoc.querySelectorAll("joint");
  const childLinks = new Set<string>();
  allJoints.forEach((joint) => {
    const child = joint.querySelector("child")?.getAttribute("link");
    if (child) childLinks.add(child);
  });

  const allLinks = xmlDoc.querySelectorAll("link");
  let rootLink: Element | null = null;
  for (const link of allLinks) {
    const linkName = link.getAttribute("name");
    if (linkName && !childLinks.has(linkName)) {
      rootLink = link;
      break;
    }
  }

  if (!rootLink) {
    console.error("Could not find root link");
    return urdfContent;
  }

  const rootName = rootLink.getAttribute("name");
  if (!rootName) return urdfContent;

  const R = createRotation90Degrees(axis);
  const RT = transpose(R);

  // Rotate the root link's visuals/collisions/inertials
  const rootVisuals = rootLink.querySelectorAll("visual");
  rootVisuals.forEach((visual) => {
    const origin = ensureOrigin(visual);
    const xyz = parseXyz(origin.getAttribute("xyz"));
    const rpy = parseRpy(origin.getAttribute("rpy"));

    const rotatedXyz = multiplyMatrixVector(R, xyz);

    const localR = rpyToMatrix(rpy);
    const rotatedR = multiplyMatrices(R, multiplyMatrices(localR, RT));
    const rotatedRpy = matrixToRpy(rotatedR);

    origin.setAttribute("xyz", formatXyz(rotatedXyz));
    origin.setAttribute("rpy", formatRpy(rotatedRpy));
  });

  const rootCollisions = rootLink.querySelectorAll("collision");
  rootCollisions.forEach((collision) => {
    const origin = ensureOrigin(collision);
    const xyz = parseXyz(origin.getAttribute("xyz"));
    const rpy = parseRpy(origin.getAttribute("rpy"));

    const rotatedXyz = multiplyMatrixVector(R, xyz);

    const localR = rpyToMatrix(rpy);
    const rotatedR = multiplyMatrices(R, multiplyMatrices(localR, RT));
    const rotatedRpy = matrixToRpy(rotatedR);

    origin.setAttribute("xyz", formatXyz(rotatedXyz));
    origin.setAttribute("rpy", formatRpy(rotatedRpy));
  });

  const rootInertial = rootLink.querySelector("inertial");
  if (rootInertial) {
    const origin = ensureOrigin(rootInertial);
    const xyz = parseXyz(origin.getAttribute("xyz"));
    const rpy = parseRpy(origin.getAttribute("rpy"));

    const rotatedXyz = multiplyMatrixVector(R, xyz);

    const localR = rpyToMatrix(rpy);
    const rotatedR = multiplyMatrices(R, multiplyMatrices(localR, RT));
    const rotatedRpy = matrixToRpy(rotatedR);

    origin.setAttribute("xyz", formatXyz(rotatedXyz));
    origin.setAttribute("rpy", formatRpy(rotatedRpy));

    const inertia = rootInertial.querySelector("inertia");
    if (inertia) {
      rotateInertia(inertia, R);
    }
  }

  // Rotate direct child joints of the root
  allJoints.forEach((joint) => {
    const parent = joint.querySelector("parent")?.getAttribute("link");
    if (parent !== rootName) return;

    const origin = ensureOrigin(joint);
    const xyz = parseXyz(origin.getAttribute("xyz"));
    const rpy = parseRpy(origin.getAttribute("rpy"));

    const rotatedXyz = multiplyMatrixVector(R, xyz);

    const localR = rpyToMatrix(rpy);
    const rotatedR = multiplyMatrices(R, multiplyMatrices(localR, RT));
    const rotatedRpy = matrixToRpy(rotatedR);

    origin.setAttribute("xyz", formatXyz(rotatedXyz));
    origin.setAttribute("rpy", formatRpy(rotatedRpy));

    const axisElement = joint.querySelector("axis");
    if (axisElement) {
      const axisXyz = parseXyz(axisElement.getAttribute("xyz"));
      const rotatedAxis = normalize(multiplyMatrixVector(R, axisXyz));
      axisElement.setAttribute("xyz", formatXyz(rotatedAxis));
    }
  });

  return serializeXml(xmlDoc);
}

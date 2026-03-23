export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];
export type InertiaTensor = {
  ixx: number;
  ixy: number;
  ixz: number;
  iyy: number;
  iyz: number;
  izz: number;
};

export type Rpy = {
  r: number;
  p: number;
  y: number;
};

export const IDENTITY_MATRIX: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function rpyToMatrix(rpy: Rpy): Mat3 {
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

export function matrixToRpy(matrix: Mat3): Rpy {
  const [[m00, m01], [m10], [m20, m21, m22]] = matrix;

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

export function multiplyMatrices(A: Mat3, B: Mat3): Mat3 {
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

export function multiplyMatrixVector(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

export function transpose(matrix: Mat3): Mat3 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

export function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function magnitude(vector: Vec3): number {
  return Math.sqrt(dot(vector, vector));
}

export function normalizeVector(vector: Vec3): Vec3 {
  const length = magnitude(vector);
  if (length < 1e-10) {
    return vector;
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function matrixFromColumns(first: Vec3, second: Vec3, third: Vec3): Mat3 {
  return [
    [first[0], second[0], third[0]],
    [first[1], second[1], third[1]],
    [first[2], second[2], third[2]],
  ];
}

export function createRotation90Degrees(axis: "x" | "y" | "z"): Mat3 {
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

export function matrixFromAxisAngle(axis: Vec3, angle: number): Mat3 {
  const [x, y, z] = normalizeVector(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;

  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

export function buildRotationBetweenVectors(from: Vec3, to: Vec3): Mat3 {
  const source = normalizeVector(from);
  const target = normalizeVector(to);
  const cosine = dot(source, target);

  if (cosine > 1 - 1e-10) {
    return IDENTITY_MATRIX;
  }

  if (cosine < -1 + 1e-10) {
    const fallback = Math.abs(source[0]) < 0.9 ? ([1, 0, 0] as Vec3) : ([0, 1, 0] as Vec3);
    const axis = normalizeVector(cross(source, fallback));
    return matrixFromAxisAngle(axis, Math.PI);
  }

  const axis = normalizeVector(cross(source, target));
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  return matrixFromAxisAngle(axis, angle);
}

export function parseXyz(attr: string | null): Vec3 {
  if (!attr) return [0, 0, 0];
  const parts = attr.trim().split(/\s+/).map((value) => Number(value));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function parseRpy(attr: string | null): Rpy {
  if (!attr) return { r: 0, p: 0, y: 0 };
  const parts = attr.trim().split(/\s+/).map((value) => Number(value));
  return { r: parts[0] || 0, p: parts[1] || 0, y: parts[2] || 0 };
}

const formatScalar = (value: number): string => {
  if (Math.abs(value) < 1e-12) {
    return "0";
  }
  return value.toFixed(10).replace(/\.?0+$/, "");
};

export function formatXyz(xyz: Vec3): string {
  return `${formatScalar(xyz[0])} ${formatScalar(xyz[1])} ${formatScalar(xyz[2])}`;
}

export function formatRpy(rpy: Rpy): string {
  return `${formatScalar(rpy.r)} ${formatScalar(rpy.p)} ${formatScalar(rpy.y)}`;
}

export function ensureOriginElement(element: Element): Element {
  let origin = Array.from(element.children).find((child) => child.tagName === "origin") ?? null;
  if (!origin) {
    origin = element.ownerDocument.createElement("origin");
    origin.setAttribute("xyz", "0 0 0");
    origin.setAttribute("rpy", "0 0 0");
    element.insertBefore(origin, element.firstChild);
  }
  return origin;
}

export function applyRotationToElementOrigin(element: Element, R: Mat3, RT: Mat3 = transpose(R)): void {
  const origin = ensureOriginElement(element);
  const xyz = parseXyz(origin.getAttribute("xyz"));
  const rpy = parseRpy(origin.getAttribute("rpy"));

  const rotatedXyz = multiplyMatrixVector(R, xyz);
  const localR = rpyToMatrix(rpy);
  const rotatedR = multiplyMatrices(R, multiplyMatrices(localR, RT));
  const rotatedRpy = matrixToRpy(rotatedR);

  origin.setAttribute("xyz", formatXyz(rotatedXyz));
  origin.setAttribute("rpy", formatRpy(rotatedRpy));
}

export function applyLeftRotationToElementOrigin(element: Element, R: Mat3): void {
  const origin = ensureOriginElement(element);
  const xyz = parseXyz(origin.getAttribute("xyz"));
  const rpy = parseRpy(origin.getAttribute("rpy"));
  const rotatedXyz = multiplyMatrixVector(R, xyz);
  const rotatedR = multiplyMatrices(R, rpyToMatrix(rpy));
  origin.setAttribute("xyz", formatXyz(rotatedXyz));
  origin.setAttribute("rpy", formatRpy(matrixToRpy(rotatedR)));
}

export function applyRightRotationToElementOrigin(element: Element, R: Mat3): void {
  const origin = ensureOriginElement(element);
  const rpy = parseRpy(origin.getAttribute("rpy"));
  const rotatedR = multiplyMatrices(rpyToMatrix(rpy), R);
  if (!origin.getAttribute("xyz")) {
    origin.setAttribute("xyz", "0 0 0");
  }
  origin.setAttribute("rpy", formatRpy(matrixToRpy(rotatedR)));
}

export function rotateInertiaTensor(tensor: InertiaTensor, R: Mat3): InertiaTensor {
  const I: Mat3 = [
    [tensor.ixx, tensor.ixy, tensor.ixz],
    [tensor.ixy, tensor.iyy, tensor.iyz],
    [tensor.ixz, tensor.iyz, tensor.izz],
  ];
  const RT = transpose(R);
  const rotated = multiplyMatrices(multiplyMatrices(R, I), RT);
  return {
    ixx: rotated[0][0],
    ixy: rotated[0][1],
    ixz: rotated[0][2],
    iyy: rotated[1][1],
    iyz: rotated[1][2],
    izz: rotated[2][2],
  };
}

export function fixInertiaThresholds(
  tensor: InertiaTensor,
  epsilon: number = 1e-8
): InertiaTensor {
  const clamp = (value: number) => (Math.abs(value) < epsilon ? 0 : value);
  return {
    ixx: clamp(tensor.ixx),
    ixy: clamp(tensor.ixy),
    ixz: clamp(tensor.ixz),
    iyy: clamp(tensor.iyy),
    iyz: clamp(tensor.iyz),
    izz: clamp(tensor.izz),
  };
}

export function rotateInertiaTensorElement(inertia: Element, R: Mat3): void {
  const rotated = rotateInertiaTensor(
    {
      ixx: parseFloat(inertia.getAttribute("ixx") || "0"),
      ixy: parseFloat(inertia.getAttribute("ixy") || "0"),
      ixz: parseFloat(inertia.getAttribute("ixz") || "0"),
      iyy: parseFloat(inertia.getAttribute("iyy") || "0"),
      iyz: parseFloat(inertia.getAttribute("iyz") || "0"),
      izz: parseFloat(inertia.getAttribute("izz") || "0"),
    },
    R
  );

  inertia.setAttribute("ixx", formatScalar(rotated.ixx));
  inertia.setAttribute("ixy", formatScalar(rotated.ixy));
  inertia.setAttribute("ixz", formatScalar(rotated.ixz));
  inertia.setAttribute("iyy", formatScalar(rotated.iyy));
  inertia.setAttribute("iyz", formatScalar(rotated.iyz));
  inertia.setAttribute("izz", formatScalar(rotated.izz));
}

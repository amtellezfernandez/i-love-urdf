import type { OriginData } from "../parsing/parseLinkData";

type Vector3 = [number, number, number];

export interface MeshBounds {
  min: Vector3;
  max: Vector3;
  size: Vector3;
  center: Vector3;
  vertices: Float32Array;
}

export type CollisionAutoFitType = "box" | "sphere" | "cylinder" | "capsule";

export type CollisionAutoFitResult = {
  geometryType: "box" | "sphere" | "cylinder";
  geometryParams: Record<string, string>;
  origin: OriginData;
  method: string;
  formula: string;
  warning?: string;
};

type PCAResult = {
  axis: Vector3;
  eigenvalues: Vector3;
  eigenvectors: [Vector3, Vector3, Vector3];
  centroid: Vector3;
};

type CylinderDiagnostics = {
  elongation: number;
  roundness: number;
  outlierRatio: number;
  radialP50: number;
  radialP95: number;
  radialMax: number;
  crossSectionVariation: number;
  eigenvalues: Vector3;
};

type SphereDiagnostics = {
  elongation: number;
  flatness: number;
  isIsotropic: boolean;
  isElongated: boolean;
  isFlat: boolean;
  radialP50: number;
  radialP95: number;
  radialMax: number;
  outlierRatio: number;
  eigenvalues: Vector3;
};

type TransformResult = {
  vertices: Float32Array;
  min: Vector3;
  max: Vector3;
};

const normalizeVector = ([x, y, z]: Vector3): Vector3 => {
  const length = Math.sqrt(x * x + y * y + z * z);
  if (length < 1e-10) {
    return [0, 0, 1];
  }
  return [x / length, y / length, z / length];
};

const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const transformVerticesToLinkFrame = (
  vertices: Float32Array,
  origin: OriginData
): TransformResult => {
  const [rx, ry, rz] = origin.rpy;
  const [tx, ty, tz] = origin.xyz;

  const cosRx = Math.cos(rx);
  const sinRx = Math.sin(rx);
  const cosRy = Math.cos(ry);
  const sinRy = Math.sin(ry);
  const cosRz = Math.cos(rz);
  const sinRz = Math.sin(rz);

  const rotationMatrix = [
    [
      cosRz * cosRy,
      cosRz * sinRy * sinRx - sinRz * cosRx,
      cosRz * sinRy * cosRx + sinRz * sinRx,
    ],
    [
      sinRz * cosRy,
      sinRz * sinRy * sinRx + cosRz * cosRx,
      sinRz * sinRy * cosRx - cosRz * sinRx,
    ],
    [-sinRy, cosRy * sinRx, cosRy * cosRx],
  ];

  const vertexCount = vertices.length / 3;
  const transformed = new Float32Array(vertices.length);

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertexCount; i += 1) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];

    const xRot = rotationMatrix[0][0] * x + rotationMatrix[0][1] * y + rotationMatrix[0][2] * z;
    const yRot = rotationMatrix[1][0] * x + rotationMatrix[1][1] * y + rotationMatrix[1][2] * z;
    const zRot = rotationMatrix[2][0] * x + rotationMatrix[2][1] * y + rotationMatrix[2][2] * z;

    const xLink = xRot + tx;
    const yLink = yRot + ty;
    const zLink = zRot + tz;

    transformed[i * 3] = xLink;
    transformed[i * 3 + 1] = yLink;
    transformed[i * 3 + 2] = zLink;

    minX = Math.min(minX, xLink);
    minY = Math.min(minY, yLink);
    minZ = Math.min(minZ, zLink);
    maxX = Math.max(maxX, xLink);
    maxY = Math.max(maxY, yLink);
    maxZ = Math.max(maxZ, zLink);
  }

  return {
    vertices: transformed,
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
};

export function computeCylinderDiagnostics(
  vertices: Float32Array,
  pca: PCAResult
): CylinderDiagnostics {
  const vertexCount = vertices.length / 3;
  const axis = pca.axis;
  const centroid = pca.centroid;
  const [lambda1, lambda2, lambda3] = pca.eigenvalues;
  const elongation = lambda1 / Math.max(lambda2, 1e-10);
  const roundness = lambda2 / Math.max(lambda3, 1e-10);
  const radialDistances: number[] = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const x = vertices[i * 3] - centroid[0];
    const y = vertices[i * 3 + 1] - centroid[1];
    const z = vertices[i * 3 + 2] - centroid[2];

    const t = x * axis[0] + y * axis[1] + z * axis[2];
    const projX = t * axis[0];
    const projY = t * axis[1];
    const projZ = t * axis[2];

    const orthoX = x - projX;
    const orthoY = y - projY;
    const orthoZ = z - projZ;
    radialDistances.push(Math.sqrt(orthoX * orthoX + orthoY * orthoY + orthoZ * orthoZ));
  }

  radialDistances.sort((a, b) => a - b);
  const radialP50 = radialDistances[Math.floor(vertexCount * 0.5)];
  const radialP95 = radialDistances[Math.floor(vertexCount * 0.95)];
  const radialMax = radialDistances[vertexCount - 1];
  const outlierRatio = radialMax / Math.max(radialP95, 1e-10);
  const crossSectionVariation = radialP95 / Math.max(radialP50, 1e-10);

  return {
    elongation,
    roundness,
    outlierRatio,
    radialP50,
    radialP95,
    radialMax,
    crossSectionVariation,
    eigenvalues: [lambda1, lambda2, lambda3],
  };
}

export function computeSphereDiagnostics(
  vertices: Float32Array,
  pca: PCAResult
): SphereDiagnostics {
  const vertexCount = vertices.length / 3;
  const centroid = pca.centroid;
  const [lambda1, lambda2, lambda3] = pca.eigenvalues;
  const elongation = lambda1 / Math.max(lambda2, 1e-10);
  const flatness = lambda2 / Math.max(lambda3, 1e-10);
  const isIsotropic = elongation < 2 && flatness < 2;
  const isElongated = elongation > 3;
  const isFlat = flatness > 3;
  const radialDistances: number[] = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const x = vertices[i * 3] - centroid[0];
    const y = vertices[i * 3 + 1] - centroid[1];
    const z = vertices[i * 3 + 2] - centroid[2];
    radialDistances.push(Math.sqrt(x * x + y * y + z * z));
  }

  radialDistances.sort((a, b) => a - b);
  const radialP50 = radialDistances[Math.floor(vertexCount * 0.5)];
  const radialP95 = radialDistances[Math.floor(vertexCount * 0.95)];
  const radialMax = radialDistances[vertexCount - 1];
  const outlierRatio = radialMax / Math.max(radialP95, 1e-10);

  return {
    elongation,
    flatness,
    isIsotropic,
    isElongated,
    isFlat,
    radialP50,
    radialP95,
    radialMax,
    outlierRatio,
    eigenvalues: [lambda1, lambda2, lambda3],
  };
}

export function fitCylinderPercentilePCA(
  vertices: Float32Array,
  pca: PCAResult,
  diagnostics: CylinderDiagnostics
): { radius: number; height: number; center: Vector3; axis: Vector3 } {
  const vertexCount = vertices.length / 3;
  const axis = pca.axis;
  const centroid = pca.centroid;
  const tValues: number[] = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const x = vertices[i * 3] - centroid[0];
    const y = vertices[i * 3 + 1] - centroid[1];
    const z = vertices[i * 3 + 2] - centroid[2];
    tValues.push(x * axis[0] + y * axis[1] + z * axis[2]);
  }

  tValues.sort((a, b) => a - b);
  const minT = tValues[0];
  const maxT = tValues[vertexCount - 1];
  const height = maxT - minT;
  const radius = diagnostics.radialP95;

  return {
    radius,
    height,
    center: [
      centroid[0] + ((minT + maxT) / 2) * axis[0],
      centroid[1] + ((minT + maxT) / 2) * axis[1],
      centroid[2] + ((minT + maxT) / 2) * axis[2],
    ],
    axis,
  };
}

export function fitCylinderConstrainedAxis(
  vertices: Float32Array,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number
): { radius: number; height: number; center: Vector3; axis: Vector3 } {
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;

  let axis: Vector3;
  let height: number;
  let centerX: number;
  let centerY: number;
  let centerZ: number;

  if (sizeX >= sizeY && sizeX >= sizeZ) {
    axis = [1, 0, 0];
    height = sizeX;
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
    centerZ = (minZ + maxZ) / 2;
  } else if (sizeY >= sizeX && sizeY >= sizeZ) {
    axis = [0, 1, 0];
    height = sizeY;
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
    centerZ = (minZ + maxZ) / 2;
  } else {
    axis = [0, 0, 1];
    height = sizeZ;
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
    centerZ = (minZ + maxZ) / 2;
  }

  const vertexCount = vertices.length / 3;
  const radialDistances: number[] = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const x = vertices[i * 3] - centerX;
    const y = vertices[i * 3 + 1] - centerY;
    const z = vertices[i * 3 + 2] - centerZ;

    const t = x * axis[0] + y * axis[1] + z * axis[2];
    const projX = t * axis[0];
    const projY = t * axis[1];
    const projZ = t * axis[2];

    const orthoX = x - projX;
    const orthoY = y - projY;
    const orthoZ = z - projZ;
    radialDistances.push(Math.sqrt(orthoX * orthoX + orthoY * orthoY + orthoZ * orthoZ));
  }

  radialDistances.sort((a, b) => a - b);
  const radius = radialDistances[Math.floor(vertexCount * 0.95)];

  return { radius, height, center: [centerX, centerY, centerZ], axis };
}

export function computePCA(vertices: Float32Array): PCAResult | null {
  if (vertices.length < 9) {
    return null;
  }

  const vertexCount = vertices.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (let i = 0; i < vertexCount; i += 1) {
    cx += vertices[i * 3];
    cy += vertices[i * 3 + 1];
    cz += vertices[i * 3 + 2];
  }

  cx /= vertexCount;
  cy /= vertexCount;
  cz /= vertexCount;

  let covXX = 0;
  let covYY = 0;
  let covZZ = 0;
  let covXY = 0;
  let covXZ = 0;
  let covYZ = 0;

  for (let i = 0; i < vertexCount; i += 1) {
    const x = vertices[i * 3] - cx;
    const y = vertices[i * 3 + 1] - cy;
    const z = vertices[i * 3 + 2] - cz;

    covXX += x * x;
    covYY += y * y;
    covZZ += z * z;
    covXY += x * y;
    covXZ += x * z;
    covYZ += y * z;
  }

  const invN = 1 / vertexCount;
  const covariance = [
    [covXX * invN, covXY * invN, covXZ * invN],
    [covXY * invN, covYY * invN, covYZ * invN],
    [covXZ * invN, covYZ * invN, covZZ * invN],
  ];

  const eigen = jacobiEigenvalue(covariance);
  let maxEigenIndex = 0;
  let maxEigen = eigen.eigenvalues[0];
  for (let i = 1; i < 3; i += 1) {
    if (eigen.eigenvalues[i] > maxEigen) {
      maxEigen = eigen.eigenvalues[i];
      maxEigenIndex = i;
    }
  }

  return {
    axis: eigen.eigenvectors[maxEigenIndex] as Vector3,
    eigenvalues: eigen.eigenvalues as Vector3,
    eigenvectors: eigen.eigenvectors as [Vector3, Vector3, Vector3],
    centroid: [cx, cy, cz],
  };
}

function jacobiEigenvalue(
  matrix: number[][]
): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = 3;
  const a = matrix.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iter = 0; iter < 10; iter += 1) {
    let maxOffDiagonal = 0;
    let p = 0;
    let q = 0;

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(a[i][j]) > maxOffDiagonal) {
          maxOffDiagonal = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
      }
    }

    if (maxOffDiagonal < 1e-6) {
      break;
    }

    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const apq = a[p][q];
    const app = a[p][p];
    const aqq = a[q][q];

    a[p][p] = c * c * app - 2 * c * s * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * c * s * apq + c * c * aqq;
    a[p][q] = a[q][p] = (c * c - s * s) * apq + c * s * (app - aqq);

    for (let k = 0; k < n; k += 1) {
      if (k !== p && k !== q) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = a[p][k] = c * akp - s * akq;
        a[k][q] = a[q][k] = s * akp + c * akq;
      }
    }

    for (let k = 0; k < n; k += 1) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }

  return {
    eigenvalues: [a[0][0], a[1][1], a[2][2]],
    eigenvectors: v,
  };
}

export function computeRotationToAxis(targetAxis: Vector3): OriginData {
  const zAxis: Vector3 = [0, 0, 1];
  const axis = normalizeVector(targetAxis);
  const dotValue = dot(zAxis, axis);

  if (Math.abs(dotValue - 1) < 1e-6) {
    return { xyz: [0, 0, 0], rpy: [0, 0, 0] };
  }

  if (Math.abs(dotValue + 1) < 1e-6) {
    return { xyz: [0, 0, 0], rpy: [0, Math.PI, 0] };
  }

  const angle = Math.acos(dotValue);
  const rotationAxis = normalizeVector(cross(zAxis, axis));

  return {
    xyz: [0, 0, 0],
    rpy: [
      Math.atan2(rotationAxis[1], rotationAxis[2]) * angle,
      Math.asin(-rotationAxis[0]) * angle,
      Math.atan2(rotationAxis[0], rotationAxis[2]) * angle,
    ],
  };
}

export const autoFitCollisionGeometry = (
  bounds: MeshBounds,
  visualOrigin: OriginData,
  requestedType: CollisionAutoFitType
): CollisionAutoFitResult | null => {
  const transformed = transformVerticesToLinkFrame(bounds.vertices, visualOrigin);
  const transformedVertices = transformed.vertices;
  const [minX, minY, minZ] = transformed.min;
  const [maxX, maxY, maxZ] = transformed.max;

  if (requestedType === "box") {
    return {
      geometryType: "box",
      geometryParams: {
        size: `${maxX - minX} ${maxY - minY} ${maxZ - minZ}`,
      },
      origin: {
        xyz: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
        rpy: [0, 0, 0],
      },
      method: "Axis-Aligned Bounding Box (AABB) in Link Frame",
      formula:
        "1. Transform mesh vertices by visual origin (xyz + rpy)\n2. Compute AABB in link coordinate frame\n3. size = [max_x - min_x, max_y - min_y, max_z - min_z]\n4. center = [(min_x + max_x)/2, (min_y + max_y)/2, (min_z + max_z)/2]",
    };
  }

  const pca = computePCA(transformedVertices);
  if (!pca) {
    return null;
  }

  if (requestedType === "sphere") {
    const diagnostics = computeSphereDiagnostics(transformedVertices, pca);
    let methodName: string;
    let formula: string;
    let warning: string | undefined;

    if (diagnostics.isIsotropic) {
      methodName = "Robust Sphere (Isotropic)";
      formula = `1. Transform vertices by visual origin\n2. elongation=${diagnostics.elongation.toFixed(
        2
      )} < 2, flatness=${diagnostics.flatness.toFixed(
        2
      )} < 2\n3. Shape is isotropic -> sphere is appropriate\n4. Use 95th percentile radius (robust to outliers)`;
    } else if (diagnostics.isElongated) {
      methodName = "Robust Sphere (Elongated - Not Ideal)";
      warning = `Shape is elongated (elongation=${diagnostics.elongation.toFixed(
        2
      )}). Consider using cylinder/capsule instead.`;
      formula = `1. Transform vertices by visual origin\n2. elongation=${diagnostics.elongation.toFixed(
        2
      )} > 3 (elongated)\n3. Sphere may not be optimal - consider cylinder\n4. Use 95th percentile radius`;
    } else if (diagnostics.isFlat) {
      methodName = "Robust Sphere (Flat - Not Ideal)";
      warning = `Shape is flat (flatness=${diagnostics.flatness.toFixed(
        2
      )}). Consider using box instead.`;
      formula = `1. Transform vertices by visual origin\n2. flatness=${diagnostics.flatness.toFixed(
        2
      )} > 3 (slab-like)\n3. Sphere may not be optimal - consider box\n4. Use 95th percentile radius`;
    } else {
      methodName = "Robust Sphere (Moderate Anisotropy)";
      formula = `1. Transform vertices by visual origin\n2. elongation=${diagnostics.elongation.toFixed(
        2
      )}, flatness=${diagnostics.flatness.toFixed(
        2
      )}\n3. Moderate anisotropy - sphere acceptable\n4. Use 95th percentile radius (robust)`;
    }

    if (diagnostics.outlierRatio > 1.3) {
      warning = warning
        ? `${warning} High outlier ratio (${diagnostics.outlierRatio.toFixed(
            2
          )}) - may have protrusions.`
        : `High outlier ratio (${diagnostics.outlierRatio.toFixed(
            2
          )}) - using robust radius to ignore protrusions.`;
    }

    return {
      geometryType: "sphere",
      geometryParams: {
        radius: String(diagnostics.radialP95),
      },
      origin: {
        xyz: [pca.centroid[0], pca.centroid[1], pca.centroid[2]],
        rpy: [0, 0, 0],
      },
      method: methodName,
      formula,
      warning,
    };
  }

  const diagnostics = computeCylinderDiagnostics(transformedVertices, pca);
  let methodName: string;
  let formula: string;
  let fitResult:
    | {
        radius: number;
        height: number;
        center: Vector3;
        axis: Vector3;
      }
    | undefined;

  if (diagnostics.elongation > 5) {
    if (diagnostics.roundness < 1.2 && diagnostics.outlierRatio < 1.2) {
      fitResult = fitCylinderPercentilePCA(transformedVertices, pca, diagnostics);
      methodName = "Percentile-based PCA Cylinder";
      formula = `1. Transform vertices by visual origin\n2. Compute PCA diagnostics\n3. elongation=${diagnostics.elongation.toFixed(
        2
      )}, roundness=${diagnostics.roundness.toFixed(
        2
      )}\n4. Use 95th percentile radius (robust)\n5. height = max(t) - min(t) along PCA axis`;
    } else if (diagnostics.roundness > 1.5) {
      fitResult = fitCylinderConstrainedAxis(
        transformedVertices,
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ
      );
      const axisName = fitResult.axis[0] === 1 ? "X" : fitResult.axis[1] === 1 ? "Y" : "Z";
      methodName = "Constrained Axis Fit (Non-circular)";
      formula = `1. Transform vertices by visual origin\n2. roundness=${diagnostics.roundness.toFixed(
        2
      )} > 1.5 (non-circular)\n3. Use longest AABB dimension: ${axisName}-axis\n4. radius = 95th percentile distance to axis`;
    } else {
      fitResult = fitCylinderPercentilePCA(transformedVertices, pca, diagnostics);
      methodName = "Percentile PCA (with Outliers)";
      formula = `1. Transform vertices by visual origin\n2. elongation=${diagnostics.elongation.toFixed(
        2
      )} > 5, outlier_ratio=${diagnostics.outlierRatio.toFixed(
        2
      )}\n3. Use 95th percentile radius (robust to outliers)\n4. PCA axis with percentile filtering`;
    }
  } else {
    fitResult = fitCylinderConstrainedAxis(
      transformedVertices,
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ
    );
    const axisName = fitResult.axis[0] === 1 ? "X" : fitResult.axis[1] === 1 ? "Y" : "Z";
    methodName = "Constrained Axis (Low Elongation)";
    formula = `1. Transform vertices by visual origin\n2. elongation=${diagnostics.elongation.toFixed(
      2
    )} < 5 (not strongly cylindrical)\n3. Use longest AABB dimension: ${axisName}-axis\n4. radius = 95th percentile distance to axis`;
  }

  if (!fitResult) {
    return null;
  }

  return {
    geometryType: "cylinder",
    geometryParams: {
      radius: String(fitResult.radius),
      length: String(fitResult.height),
    },
    origin: {
      xyz: fitResult.center,
      rpy: computeRotationToAxis(fitResult.axis).rpy,
    },
    method: methodName,
    formula,
    warning: requestedType === "capsule" ? "Capsule approximated as cylinder in URDF" : undefined,
  };
};

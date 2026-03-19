"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDENTITY_MATRIX = void 0;
exports.rpyToMatrix = rpyToMatrix;
exports.matrixToRpy = matrixToRpy;
exports.multiplyMatrices = multiplyMatrices;
exports.multiplyMatrixVector = multiplyMatrixVector;
exports.transpose = transpose;
exports.dot = dot;
exports.cross = cross;
exports.magnitude = magnitude;
exports.normalizeVector = normalizeVector;
exports.matrixFromColumns = matrixFromColumns;
exports.createRotation90Degrees = createRotation90Degrees;
exports.matrixFromAxisAngle = matrixFromAxisAngle;
exports.buildRotationBetweenVectors = buildRotationBetweenVectors;
exports.parseXyz = parseXyz;
exports.parseRpy = parseRpy;
exports.formatXyz = formatXyz;
exports.formatRpy = formatRpy;
exports.ensureOriginElement = ensureOriginElement;
exports.applyRotationToElementOrigin = applyRotationToElementOrigin;
exports.applyLeftRotationToElementOrigin = applyLeftRotationToElementOrigin;
exports.applyRightRotationToElementOrigin = applyRightRotationToElementOrigin;
exports.rotateInertiaTensorElement = rotateInertiaTensorElement;
exports.IDENTITY_MATRIX = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
];
function rpyToMatrix(rpy) {
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
function matrixToRpy(matrix) {
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
function multiplyMatrices(A, B) {
    const result = [
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
function multiplyMatrixVector(matrix, vector) {
    return [
        matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
        matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
        matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
    ];
}
function transpose(matrix) {
    return [
        [matrix[0][0], matrix[1][0], matrix[2][0]],
        [matrix[0][1], matrix[1][1], matrix[2][1]],
        [matrix[0][2], matrix[1][2], matrix[2][2]],
    ];
}
function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}
function magnitude(vector) {
    return Math.sqrt(dot(vector, vector));
}
function normalizeVector(vector) {
    const length = magnitude(vector);
    if (length < 1e-10) {
        return vector;
    }
    return [vector[0] / length, vector[1] / length, vector[2] / length];
}
function matrixFromColumns(first, second, third) {
    return [
        [first[0], second[0], third[0]],
        [first[1], second[1], third[1]],
        [first[2], second[2], third[2]],
    ];
}
function createRotation90Degrees(axis) {
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
function matrixFromAxisAngle(axis, angle) {
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
function buildRotationBetweenVectors(from, to) {
    const source = normalizeVector(from);
    const target = normalizeVector(to);
    const cosine = dot(source, target);
    if (cosine > 1 - 1e-10) {
        return exports.IDENTITY_MATRIX;
    }
    if (cosine < -1 + 1e-10) {
        const fallback = Math.abs(source[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const axis = normalizeVector(cross(source, fallback));
        return matrixFromAxisAngle(axis, Math.PI);
    }
    const axis = normalizeVector(cross(source, target));
    const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    return matrixFromAxisAngle(axis, angle);
}
function parseXyz(attr) {
    if (!attr)
        return [0, 0, 0];
    const parts = attr.trim().split(/\s+/).map((value) => Number(value));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
function parseRpy(attr) {
    if (!attr)
        return { r: 0, p: 0, y: 0 };
    const parts = attr.trim().split(/\s+/).map((value) => Number(value));
    return { r: parts[0] || 0, p: parts[1] || 0, y: parts[2] || 0 };
}
const formatScalar = (value) => {
    if (Math.abs(value) < 1e-12) {
        return "0";
    }
    return value.toFixed(10).replace(/\.?0+$/, "");
};
function formatXyz(xyz) {
    return `${formatScalar(xyz[0])} ${formatScalar(xyz[1])} ${formatScalar(xyz[2])}`;
}
function formatRpy(rpy) {
    return `${formatScalar(rpy.r)} ${formatScalar(rpy.p)} ${formatScalar(rpy.y)}`;
}
function ensureOriginElement(element) {
    let origin = Array.from(element.children).find((child) => child.tagName === "origin") ?? null;
    if (!origin) {
        origin = element.ownerDocument.createElement("origin");
        origin.setAttribute("xyz", "0 0 0");
        origin.setAttribute("rpy", "0 0 0");
        element.insertBefore(origin, element.firstChild);
    }
    return origin;
}
function applyRotationToElementOrigin(element, R, RT = transpose(R)) {
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
function applyLeftRotationToElementOrigin(element, R) {
    const origin = ensureOriginElement(element);
    const xyz = parseXyz(origin.getAttribute("xyz"));
    const rpy = parseRpy(origin.getAttribute("rpy"));
    const rotatedXyz = multiplyMatrixVector(R, xyz);
    const rotatedR = multiplyMatrices(R, rpyToMatrix(rpy));
    origin.setAttribute("xyz", formatXyz(rotatedXyz));
    origin.setAttribute("rpy", formatRpy(matrixToRpy(rotatedR)));
}
function applyRightRotationToElementOrigin(element, R) {
    const origin = ensureOriginElement(element);
    const rpy = parseRpy(origin.getAttribute("rpy"));
    const rotatedR = multiplyMatrices(rpyToMatrix(rpy), R);
    if (!origin.getAttribute("xyz")) {
        origin.setAttribute("xyz", "0 0 0");
    }
    origin.setAttribute("rpy", formatRpy(matrixToRpy(rotatedR)));
}
function rotateInertiaTensorElement(inertia, R) {
    const ixx = parseFloat(inertia.getAttribute("ixx") || "0");
    const ixy = parseFloat(inertia.getAttribute("ixy") || "0");
    const ixz = parseFloat(inertia.getAttribute("ixz") || "0");
    const iyy = parseFloat(inertia.getAttribute("iyy") || "0");
    const iyz = parseFloat(inertia.getAttribute("iyz") || "0");
    const izz = parseFloat(inertia.getAttribute("izz") || "0");
    const I = [
        [ixx, ixy, ixz],
        [ixy, iyy, iyz],
        [ixz, iyz, izz],
    ];
    const RT = transpose(R);
    const rotated = multiplyMatrices(multiplyMatrices(R, I), RT);
    inertia.setAttribute("ixx", formatScalar(rotated[0][0]));
    inertia.setAttribute("ixy", formatScalar(rotated[0][1]));
    inertia.setAttribute("ixz", formatScalar(rotated[0][2]));
    inertia.setAttribute("iyy", formatScalar(rotated[1][1]));
    inertia.setAttribute("iyz", formatScalar(rotated[1][2]));
    inertia.setAttribute("izz", formatScalar(rotated[2][2]));
}

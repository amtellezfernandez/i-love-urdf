import { parseLinkDataFromDocument, type LinkData, type OriginData } from "../parsing/parseLinkData";
import { parseURDF } from "../parsing/urdfParser";
import { normalizeJointAxis } from "../utils/normalizeJointAxes";
import {
  buildRotationBetweenVectors,
  fixInertiaThresholds,
  multiplyMatrices,
  parseRpy,
  parseXyz,
  rpyToMatrix,
  type Mat3,
  type Rpy,
  type Vec3,
} from "../utils/rotationMath";
import { sanitizeUrdfName } from "../utils/urdfNames";

export type UsdUpAxis = "Y" | "Z";
export type UsdQuaternion = [number, number, number, number];

export type InlineUsdMesh = {
  triangles: Float32Array;
  sourcePath?: string | null;
};

export type ResolvedUsdMesh =
  | { kind: "inline-triangles"; mesh: InlineUsdMesh }
  | { kind: "usd-reference"; assetPath: string }
  | { kind: "unsupported"; sourcePath?: string | null; reason: string };

export type UsdMeshResolveRequest = {
  meshRef: string;
  linkName: string;
  geometryName: string;
  kind: "visual" | "collision";
};

export type UsdPrim = {
  name: string;
  typeName: string;
  metadata?: string[];
  properties?: string[];
  children?: UsdPrim[];
};

export type UsdStage = {
  outputPath: string | null;
  defaultPrim: string;
  upAxis: UsdUpAxis;
  metersPerUnit: number;
  kilogramsPerUnit: number;
  rootPrims: UsdPrim[];
  toUsda: () => string;
};

export type CreateUsdStageOptions = {
  defaultPrim?: string;
  upAxis?: UsdUpAxis;
  metersPerUnit?: number;
  kilogramsPerUnit?: number;
  rootPrims?: UsdPrim[];
};

export type UrdfToUsdStats = {
  linksConverted: number;
  jointsConverted: number;
  visualsConverted: number;
  collisionsConverted: number;
  inlineMeshesConverted: number;
  unsupportedMeshes: number;
};

export type ConvertURDFToUSDOptions = {
  defaultPrim?: string;
  robotPrimName?: string;
  upAxis?: UsdUpAxis;
  metersPerUnit?: number;
  kilogramsPerUnit?: number;
  includeVisuals?: boolean;
  includeCollisions?: boolean;
  includeJoints?: boolean;
  meshResolver?: (request: UsdMeshResolveRequest) => ResolvedUsdMesh | null;
};

export type URDFToUSDConversionResult = {
  usdContent: string;
  stage: UsdStage;
  warnings: string[];
  stats: UrdfToUsdStats;
};

export type MapUrdfToUsdPrimOptions = {
  path?: string;
  translation?: Vec3;
  orientation?: UsdQuaternion;
  includeVisuals?: boolean;
  includeCollisions?: boolean;
  meshResolver?: (request: UsdMeshResolveRequest) => ResolvedUsdMesh | null;
};

export type InlineUsdMeshPrimOptions = {
  name: string;
  translation?: Vec3;
  orientation?: UsdQuaternion;
  scale?: Vec3;
  sourcePath?: string | null;
  metadata?: string[];
  additionalProperties?: string[];
};

type ParsedJoint = {
  name: string;
  type: string;
  parent: string;
  child: string;
  originXyz: Vec3;
  originRpy: Rpy;
  axis: Vec3;
  limitLower?: number;
  limitUpper?: number;
};

type LinkTreeNode = {
  linkName: string;
  children: LinkTreeNode[];
};

const IDENTITY_QUATERNION: UsdQuaternion = [1, 0, 0, 0];
const X_AXIS: Vec3 = [1, 0, 0];
const Y_AXIS: Vec3 = [0, 1, 0];
const Z_AXIS: Vec3 = [0, 0, 1];

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1e-9) return "0";
  return value.toFixed(6).replace(/\.?0+$/, "");
};

const formatString = (value: string): string => JSON.stringify(value);

const formatVec3 = (value: Vec3): string =>
  `(${formatNumber(value[0])}, ${formatNumber(value[1])}, ${formatNumber(value[2])})`;

const formatQuat = (value: UsdQuaternion): string =>
  `(${formatNumber(value[0])}, ${formatNumber(value[1])}, ${formatNumber(value[2])}, ${formatNumber(value[3])})`;

const formatVec3Array = (values: readonly Vec3[]): string =>
  `[${values.map((value) => formatVec3(value as Vec3)).join(", ")}]`;

const formatNumberArray = (values: readonly number[]): string =>
  `[${values.map((value) => formatNumber(value)).join(", ")}]`;

const formatTokenArray = (values: readonly string[]): string =>
  `[${values.map((value) => formatString(value)).join(", ")}]`;

const renderUsdPrim = (prim: UsdPrim, indentLevel: number = 0): string => {
  const indent = "  ".repeat(indentLevel);
  const metadata = prim.metadata && prim.metadata.length > 0
    ? ` (\n${prim.metadata.map((line) => `${indent}  ${line}`).join("\n")}\n${indent})`
    : "";
  const properties = prim.properties?.length ? prim.properties.map((line) => `${indent}  ${line}`) : [];
  const children = prim.children?.length
    ? prim.children.map((child) => renderUsdPrim(child, indentLevel + 1))
    : [];
  const body = [...properties, ...children].join("\n");
  return `${indent}def ${prim.typeName} ${formatString(prim.name)}${metadata}\n${indent}{\n${body ? `${body}\n` : ""}${indent}}`;
};

export function createUsdStage(
  outputPath: string | null = null,
  options: CreateUsdStageOptions = {}
): UsdStage {
  const stage: UsdStage = {
    outputPath,
    defaultPrim: options.defaultPrim || "World",
    upAxis: options.upAxis || "Z",
    metersPerUnit: options.metersPerUnit ?? 1,
    kilogramsPerUnit: options.kilogramsPerUnit ?? 1,
    rootPrims: options.rootPrims ? [...options.rootPrims] : [],
    toUsda() {
      const header = [
        "#usda 1.0",
        "",
        "(",
        `  defaultPrim = ${formatString(stage.defaultPrim)}`,
        `  metersPerUnit = ${formatNumber(stage.metersPerUnit)}`,
        `  kilogramsPerUnit = ${formatNumber(stage.kilogramsPerUnit)}`,
        `  upAxis = ${formatString(stage.upAxis)}`,
        ")",
        "",
      ];
      return `${header.join("\n")}${stage.rootPrims.map((prim) => renderUsdPrim(prim)).join("\n\n")}\n`;
    },
  };
  return stage;
}

const parseJointElements = (xmlDoc: Document): ParsedJoint[] =>
  Array.from(xmlDoc.querySelectorAll("joint")).flatMap((jointElement) => {
    const name = jointElement.getAttribute("name") || "";
    const type = jointElement.getAttribute("type") || "fixed";
    const parent = jointElement.querySelector("parent")?.getAttribute("link") || "";
    const child = jointElement.querySelector("child")?.getAttribute("link") || "";
    if (!name || !parent || !child) {
      return [];
    }
    const limit = jointElement.querySelector("limit");
    const lowerRaw = limit?.getAttribute("lower");
    const upperRaw = limit?.getAttribute("upper");
    const lower = lowerRaw !== null ? Number(lowerRaw) : undefined;
    const upper = upperRaw !== null ? Number(upperRaw) : undefined;
    return [{
      name,
      type,
      parent,
      child,
      originXyz: parseXyz(jointElement.querySelector("origin")?.getAttribute("xyz") ?? null),
      originRpy: parseRpy(jointElement.querySelector("origin")?.getAttribute("rpy") ?? null),
      axis: normalizeJointAxis(jointElement.querySelector("axis")?.getAttribute("xyz") ?? "1 0 0"),
      limitLower: Number.isFinite(lower) ? lower : undefined,
      limitUpper: Number.isFinite(upper) ? upper : undefined,
    }];
  });

const buildLinkDataMap = (xmlDoc: Document): Record<string, LinkData> => {
  const map: Record<string, LinkData> = {};
  Array.from(xmlDoc.querySelectorAll("link")).forEach((linkElement) => {
    const name = linkElement.getAttribute("name");
    if (!name) return;
    const data = parseLinkDataFromDocument(xmlDoc, name);
    if (data) {
      map[name] = data;
    }
  });
  return map;
};

const makeUniqueNameMap = (names: readonly string[]): Map<string, string> => {
  const seen = new Map<string, number>();
  const result = new Map<string, string>();
  for (const name of names) {
    const base = sanitizeUrdfName(name) || "item";
    const nextIndex = (seen.get(base) ?? 0) + 1;
    seen.set(base, nextIndex);
    result.set(name, nextIndex === 1 ? base : `${base}_${nextIndex}`);
  }
  return result;
};

const matrixToQuaternion = (matrix: Mat3): UsdQuaternion => {
  const trace = matrix[0][0] + matrix[1][1] + matrix[2][2];
  let w = 1;
  let x = 0;
  let y = 0;
  let z = 0;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (matrix[2][1] - matrix[1][2]) / s;
    y = (matrix[0][2] - matrix[2][0]) / s;
    z = (matrix[1][0] - matrix[0][1]) / s;
  } else if (matrix[0][0] > matrix[1][1] && matrix[0][0] > matrix[2][2]) {
    const s = Math.sqrt(1 + matrix[0][0] - matrix[1][1] - matrix[2][2]) * 2;
    w = (matrix[2][1] - matrix[1][2]) / s;
    x = 0.25 * s;
    y = (matrix[0][1] + matrix[1][0]) / s;
    z = (matrix[0][2] + matrix[2][0]) / s;
  } else if (matrix[1][1] > matrix[2][2]) {
    const s = Math.sqrt(1 + matrix[1][1] - matrix[0][0] - matrix[2][2]) * 2;
    w = (matrix[0][2] - matrix[2][0]) / s;
    x = (matrix[0][1] + matrix[1][0]) / s;
    y = 0.25 * s;
    z = (matrix[1][2] + matrix[2][1]) / s;
  } else {
    const s = Math.sqrt(1 + matrix[2][2] - matrix[0][0] - matrix[1][1]) * 2;
    w = (matrix[1][0] - matrix[0][1]) / s;
    x = (matrix[0][2] + matrix[2][0]) / s;
    y = (matrix[1][2] + matrix[2][1]) / s;
    z = 0.25 * s;
  }

  return [w, x, y, z];
};

const isIdentityQuaternion = (quat: UsdQuaternion): boolean =>
  Math.abs(quat[0] - 1) < 1e-6 &&
  Math.abs(quat[1]) < 1e-6 &&
  Math.abs(quat[2]) < 1e-6 &&
  Math.abs(quat[3]) < 1e-6;

const isIdentityScale = (scale: Vec3): boolean =>
  Math.abs(scale[0] - 1) < 1e-6 &&
  Math.abs(scale[1] - 1) < 1e-6 &&
  Math.abs(scale[2] - 1) < 1e-6;

const isZeroVec3 = (value: Vec3): boolean =>
  Math.abs(value[0]) < 1e-9 &&
  Math.abs(value[1]) < 1e-9 &&
  Math.abs(value[2]) < 1e-9;

const buildXformProperties = (params: {
  translation?: Vec3;
  orientation?: UsdQuaternion;
  scale?: Vec3;
}): string[] => {
  const translation = params.translation ?? [0, 0, 0];
  const orientation = params.orientation ?? IDENTITY_QUATERNION;
  const scale = params.scale ?? [1, 1, 1];
  const properties: string[] = [];
  const order: string[] = [];

  if (!isZeroVec3(translation)) {
    properties.push(`double3 xformOp:translate = ${formatVec3(translation)}`);
    order.push("xformOp:translate");
  }
  if (!isIdentityQuaternion(orientation)) {
    properties.push(`quatf xformOp:orient = ${formatQuat(orientation)}`);
    order.push("xformOp:orient");
  }
  if (!isIdentityScale(scale)) {
    properties.push(`float3 xformOp:scale = ${formatVec3(scale)}`);
    order.push("xformOp:scale");
  }

  if (order.length > 0) {
    properties.push(`uniform token[] xformOpOrder = ${formatTokenArray(order)}`);
  }
  return properties;
};

const parseHexColor = (value: string | null): Vec3 | null => {
  if (!value || !/^#?[0-9a-f]{6}$/i.test(value)) {
    return null;
  }
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  ];
};

const buildDisplayColorProperty = (color: string | null): string[] => {
  const rgb = parseHexColor(color);
  if (!rgb) return [];
  return [`color3f[] primvars:displayColor = [${formatVec3(rgb)}]`];
};

const buildInlineMeshProperties = (mesh: InlineUsdMesh): string[] => {
  const points: Vec3[] = [];
  const faceVertexCounts: number[] = [];
  const faceVertexIndices: number[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < mesh.triangles.length; index += 9) {
    const baseVertex = points.length;
    faceVertexCounts.push(3);
    faceVertexIndices.push(baseVertex, baseVertex + 1, baseVertex + 2);
    for (let offset = 0; offset < 9; offset += 3) {
      const point: Vec3 = [
        mesh.triangles[index + offset],
        mesh.triangles[index + offset + 1],
        mesh.triangles[index + offset + 2],
      ];
      points.push(point);
      if (point[0] < minX) minX = point[0];
      if (point[1] < minY) minY = point[1];
      if (point[2] < minZ) minZ = point[2];
      if (point[0] > maxX) maxX = point[0];
      if (point[1] > maxY) maxY = point[1];
      if (point[2] > maxZ) maxZ = point[2];
    }
  }

  const properties = [
    `int[] faceVertexCounts = ${formatNumberArray(faceVertexCounts)}`,
    `int[] faceVertexIndices = ${formatNumberArray(faceVertexIndices)}`,
    `point3f[] points = ${formatVec3Array(points)}`,
    `uniform token subdivisionScheme = "none"`,
  ];
  if (points.length > 0) {
    properties.push(
      `float3[] extent = [${formatVec3([minX, minY, minZ])}, ${formatVec3([maxX, maxY, maxZ])}]`
    );
  }
  if (mesh.sourcePath) {
    properties.push(`custom string userProperties:sourceMesh = ${formatString(mesh.sourcePath)}`);
  }
  return properties;
};

export function createInlineUsdMeshPrim(
  mesh: InlineUsdMesh,
  options: InlineUsdMeshPrimOptions
): UsdPrim {
  return {
    name: options.name,
    typeName: "Mesh",
    metadata: options.metadata,
    properties: [
      ...buildXformProperties({
        translation: options.translation,
        orientation: options.orientation,
        scale: options.scale,
      }),
      ...buildInlineMeshProperties({
        ...mesh,
        sourcePath: options.sourcePath ?? mesh.sourcePath,
      }),
      ...(options.additionalProperties ?? []),
    ],
  };
}

const toScale = (raw: string | undefined, fallback: Vec3 = [1, 1, 1]): Vec3 => {
  if (!raw) return fallback;
  const parts = raw.trim().split(/\s+/).map(Number);
  return [
    Number.isFinite(parts[0]) ? parts[0] : fallback[0],
    Number.isFinite(parts[1]) ? parts[1] : fallback[1],
    Number.isFinite(parts[2]) ? parts[2] : fallback[2],
  ];
};

const geometryOriginToQuat = (origin: OriginData): UsdQuaternion =>
  matrixToQuaternion(rpyToMatrix({ r: origin.rpy[0], p: origin.rpy[1], y: origin.rpy[2] }));

const buildVisualPrim = (
  linkName: string,
  index: number,
  visual: LinkData["visuals"][number],
  meshResolver: ConvertURDFToUSDOptions["meshResolver"] | undefined,
  warnings: string[],
  stats: UrdfToUsdStats
): UsdPrim | null => {
  const baseName = `visual_${index}`;
  const xformProps = buildXformProperties({
    translation: visual.origin.xyz,
    orientation: geometryOriginToQuat(visual.origin),
  });
  const colorProps = buildDisplayColorProperty(visual.materialColor);

  switch (visual.geometry.type) {
    case "box": {
      const size = toScale(visual.geometry.params.size, [1, 1, 1]);
      stats.visualsConverted += 1;
      return {
        name: baseName,
        typeName: "Cube",
        properties: [
          ...buildXformProperties({
            translation: visual.origin.xyz,
            orientation: geometryOriginToQuat(visual.origin),
            scale: size,
          }),
          `double size = 1`,
          `float3[] extent = [${formatVec3([-0.5, -0.5, -0.5])}, ${formatVec3([0.5, 0.5, 0.5])}]`,
          ...colorProps,
        ],
      };
    }
    case "sphere": {
      const radius = Number(visual.geometry.params.radius || "1");
      stats.visualsConverted += 1;
      return {
        name: baseName,
        typeName: "Sphere",
        properties: [
          ...xformProps,
          `double radius = ${formatNumber(radius)}`,
          `float3[] extent = [${formatVec3([-radius, -radius, -radius])}, ${formatVec3([radius, radius, radius])}]`,
          ...colorProps,
        ],
      };
    }
    case "cylinder": {
      const radius = Number(visual.geometry.params.radius || "1");
      const length = Number(visual.geometry.params.length || "1");
      stats.visualsConverted += 1;
      return {
        name: baseName,
        typeName: "Cylinder",
        properties: [
          ...xformProps,
          `uniform token axis = "Z"`,
          `double radius = ${formatNumber(radius)}`,
          `double height = ${formatNumber(length)}`,
          ...colorProps,
        ],
      };
    }
    case "mesh": {
      const filename = visual.geometry.params.filename || "";
      const scale = toScale(visual.geometry.params.scale, [1, 1, 1]);
      const resolved = meshResolver?.({
        meshRef: filename,
        linkName,
        geometryName: baseName,
        kind: "visual",
      }) ?? (/\.(usd|usda|usdc)$/i.test(filename)
        ? { kind: "usd-reference" as const, assetPath: filename }
        : null);
      if (!resolved) {
        warnings.push(`Skipped unsupported visual mesh ${filename} on link ${linkName}.`);
        stats.unsupportedMeshes += 1;
        return {
          name: baseName,
          typeName: "Xform",
          properties: [
            ...buildXformProperties({
              translation: visual.origin.xyz,
              orientation: geometryOriginToQuat(visual.origin),
              scale,
            }),
            `custom string userProperties:sourceMesh = ${formatString(filename)}`,
            ...colorProps,
          ],
        };
      }
      if (resolved.kind === "unsupported") {
        warnings.push(`Skipped visual mesh ${filename} on link ${linkName}: ${resolved.reason}`);
        stats.unsupportedMeshes += 1;
        return {
          name: baseName,
          typeName: "Xform",
          properties: [
            ...xformProps,
            ...buildXformProperties({ scale }),
            `custom string userProperties:sourceMesh = ${formatString(filename)}`,
            ...colorProps,
          ],
        };
      }
      if (resolved.kind === "usd-reference") {
        stats.visualsConverted += 1;
        return {
          name: baseName,
          typeName: "Xform",
          metadata: [`prepend references = @${resolved.assetPath}@`],
          properties: [
            ...buildXformProperties({
              translation: visual.origin.xyz,
              orientation: geometryOriginToQuat(visual.origin),
              scale,
            }),
          ],
        };
      }
      stats.visualsConverted += 1;
      stats.inlineMeshesConverted += 1;
      return createInlineUsdMeshPrim(
        {
          ...resolved.mesh,
          sourcePath: resolved.mesh.sourcePath ?? filename,
        },
        {
          name: baseName,
          translation: visual.origin.xyz,
          orientation: geometryOriginToQuat(visual.origin),
          scale,
          additionalProperties: colorProps,
        }
      );
    }
    default:
      return null;
  }
};

const buildCollisionPrim = (
  linkName: string,
  index: number,
  collision: LinkData["collisions"][number],
  meshResolver: ConvertURDFToUSDOptions["meshResolver"] | undefined,
  warnings: string[],
  stats: UrdfToUsdStats
): UsdPrim | null => {
  const baseName = `collision_${index}`;
  const baseProperties = [
    ...buildXformProperties({
      translation: collision.origin.xyz,
      orientation: geometryOriginToQuat(collision.origin),
    }),
    `token visibility = "invisible"`,
  ];

  switch (collision.geometry.type) {
    case "box": {
      const size = toScale(collision.geometry.params.size, [1, 1, 1]);
      stats.collisionsConverted += 1;
      return {
        name: baseName,
        typeName: "Cube",
        metadata: [`prepend apiSchemas = ["PhysicsCollisionAPI"]`],
        properties: [
          ...buildXformProperties({
            translation: collision.origin.xyz,
            orientation: geometryOriginToQuat(collision.origin),
            scale: size,
          }),
          `token visibility = "invisible"`,
          `double size = 1`,
          `float3[] extent = [${formatVec3([-0.5, -0.5, -0.5])}, ${formatVec3([0.5, 0.5, 0.5])}]`,
        ],
      };
    }
    case "sphere": {
      const radius = Number(collision.geometry.params.radius || "1");
      stats.collisionsConverted += 1;
      return {
        name: baseName,
        typeName: "Sphere",
        metadata: [`prepend apiSchemas = ["PhysicsCollisionAPI"]`],
        properties: [...baseProperties, `double radius = ${formatNumber(radius)}`],
      };
    }
    case "cylinder": {
      const radius = Number(collision.geometry.params.radius || "1");
      const length = Number(collision.geometry.params.length || "1");
      stats.collisionsConverted += 1;
      return {
        name: baseName,
        typeName: "Cylinder",
        metadata: [`prepend apiSchemas = ["PhysicsCollisionAPI"]`],
        properties: [
          ...baseProperties,
          `uniform token axis = "Z"`,
          `double radius = ${formatNumber(radius)}`,
          `double height = ${formatNumber(length)}`,
        ],
      };
    }
    case "mesh": {
      const filename = collision.geometry.params.filename || "";
      const resolved = meshResolver?.({
        meshRef: filename,
        linkName,
        geometryName: baseName,
        kind: "collision",
      }) ?? (/\.(usd|usda|usdc)$/i.test(filename)
        ? { kind: "usd-reference" as const, assetPath: filename }
        : null);
      const scale = toScale(collision.geometry.params.scale, [1, 1, 1]);
      if (!resolved) {
        warnings.push(`Skipped unsupported collision mesh ${filename} on link ${linkName}.`);
        stats.unsupportedMeshes += 1;
        return null;
      }
      if (resolved.kind === "unsupported") {
        warnings.push(`Skipped collision mesh ${filename} on link ${linkName}: ${resolved.reason}`);
        stats.unsupportedMeshes += 1;
        return null;
      }
      if (resolved.kind === "usd-reference") {
        stats.collisionsConverted += 1;
        return {
          name: baseName,
          typeName: "Xform",
          metadata: [`prepend references = @${resolved.assetPath}@`],
          properties: [
            ...buildXformProperties({
              translation: collision.origin.xyz,
              orientation: geometryOriginToQuat(collision.origin),
              scale,
            }),
            `token visibility = "invisible"`,
            `custom string userProperties:sourceMesh = ${formatString(filename)}`,
          ],
        };
      }
      stats.collisionsConverted += 1;
      stats.inlineMeshesConverted += 1;
      return createInlineUsdMeshPrim(
        {
          ...resolved.mesh,
          sourcePath: resolved.mesh.sourcePath ?? filename,
        },
        {
          name: baseName,
          translation: collision.origin.xyz,
          orientation: geometryOriginToQuat(collision.origin),
          scale,
          metadata: [`prepend apiSchemas = ["PhysicsCollisionAPI"]`],
          additionalProperties: [`token visibility = "invisible"`],
        }
      );
    }
    default:
      return null;
  }
};

export function mapUrdfToUsdPrim(
  link: LinkData,
  options: MapUrdfToUsdPrimOptions = {}
): { prim: UsdPrim; warnings: string[]; stats: UrdfToUsdStats } {
  const warnings: string[] = [];
  const stats: UrdfToUsdStats = {
    linksConverted: 1,
    jointsConverted: 0,
    visualsConverted: 0,
    collisionsConverted: 0,
    inlineMeshesConverted: 0,
    unsupportedMeshes: 0,
  };

  const properties = buildXformProperties({
    translation: options.translation,
    orientation: options.orientation,
  });
  const metadata = [`prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsMassAPI"]`];

  if (link.inertial) {
    const inertia = fixInertiaThresholds(link.inertial.inertia);
    properties.push(`float physics:mass = ${formatNumber(link.inertial.mass)}`);
    properties.push(`point3f physics:centerOfMass = ${formatVec3(link.inertial.origin.xyz)}`);
    properties.push(
      `float3 physics:diagonalInertia = ${formatVec3([inertia.ixx, inertia.iyy, inertia.izz])}`
    );
  }

  const children: UsdPrim[] = [];
  if (options.includeVisuals !== false) {
    link.visuals.forEach((visual, index) => {
      const prim = buildVisualPrim(link.name, index, visual, options.meshResolver, warnings, stats);
      if (prim) children.push(prim);
    });
  }
  if (options.includeCollisions !== false) {
    link.collisions.forEach((collision, index) => {
      const prim = buildCollisionPrim(link.name, index, collision, options.meshResolver, warnings, stats);
      if (prim) children.push(prim);
    });
  }

  return {
    prim: {
      name: options.path || sanitizeUrdfName(link.name) || "link",
      typeName: "Xform",
      metadata,
      properties,
      children,
    },
    warnings,
    stats,
  };
}

const collectLinkNames = (xmlDoc: Document): string[] =>
  Array.from(xmlDoc.querySelectorAll("link"))
    .map((link) => link.getAttribute("name") || "")
    .filter((name) => name.length > 0);

const buildLinkTree = (linkNames: readonly string[], joints: readonly ParsedJoint[]): LinkTreeNode[] => {
  const childSet = new Set(joints.map((joint) => joint.child));
  const childrenByParent = new Map<string, ParsedJoint[]>();
  joints.forEach((joint) => {
    const entry = childrenByParent.get(joint.parent) ?? [];
    entry.push(joint);
    childrenByParent.set(joint.parent, entry);
  });

  const buildNode = (linkName: string): LinkTreeNode => ({
    linkName,
    children: (childrenByParent.get(linkName) ?? []).map((joint) => buildNode(joint.child)),
  });

  return linkNames.filter((name) => !childSet.has(name)).map((name) => buildNode(name));
};

const dominantAxisToken = (axis: Vec3): { token: "X" | "Y" | "Z"; vector: Vec3 } => {
  const [x, y, z] = axis.map((value) => Math.abs(value));
  if (x >= y && x >= z) return { token: "X", vector: X_AXIS };
  if (y >= x && y >= z) return { token: "Y", vector: Y_AXIS };
  return { token: "Z", vector: Z_AXIS };
};

const buildJointPrims = (
  joints: readonly ParsedJoint[],
  robotPrimPath: string,
  linkPathByName: Map<string, string>,
  rootLinks: readonly string[],
  jointNameMap: Map<string, string>,
  warnings: string[],
  stats: UrdfToUsdStats
): UsdPrim[] => {
  const jointPrims: UsdPrim[] = [];
  const rootLinkSet = new Set(rootLinks);

  rootLinks.forEach((rootLink) => {
    const rootLinkPath = linkPathByName.get(rootLink);
    if (!rootLinkPath) return;
    jointPrims.push({
      name: `${sanitizeUrdfName(rootLink)}_root_joint`,
      typeName: "PhysicsFixedJoint",
      properties: [
        `rel physics:body0 = <${robotPrimPath}>`,
        `rel physics:body1 = <${rootLinkPath}>`,
        `point3f physics:localPos0 = ${formatVec3([0, 0, 0])}`,
        `point3f physics:localPos1 = ${formatVec3([0, 0, 0])}`,
        `quatf physics:localRot0 = ${formatQuat(IDENTITY_QUATERNION)}`,
        `quatf physics:localRot1 = ${formatQuat(IDENTITY_QUATERNION)}`,
      ],
    });
  });

  joints.forEach((joint) => {
    if (rootLinkSet.has(joint.child)) {
      return;
    }
    const body0 = linkPathByName.get(joint.parent);
    const body1 = linkPathByName.get(joint.child);
    if (!body0 || !body1) return;

    let typeName = "PhysicsFixedJoint";
    if (joint.type === "revolute" || joint.type === "continuous") {
      typeName = "PhysicsRevoluteJoint";
    } else if (joint.type === "prismatic") {
      typeName = "PhysicsPrismaticJoint";
    } else if (joint.type !== "fixed") {
      warnings.push(`USD export currently downgrades joint ${joint.name} of type ${joint.type} to PhysicsFixedJoint.`);
    }

    const axisChoice = dominantAxisToken(joint.axis);
    const axisAlignment = buildRotationBetweenVectors(axisChoice.vector, joint.axis);
    const localRot0 = matrixToQuaternion(
      multiplyMatrices(rpyToMatrix(joint.originRpy), axisAlignment)
    );
    const localRot1 = matrixToQuaternion(axisAlignment);
    const properties = [
      `rel physics:body0 = <${body0}>`,
      `rel physics:body1 = <${body1}>`,
      `point3f physics:localPos0 = ${formatVec3(joint.originXyz)}`,
      `point3f physics:localPos1 = ${formatVec3([0, 0, 0])}`,
      `quatf physics:localRot0 = ${formatQuat(localRot0)}`,
      `quatf physics:localRot1 = ${formatQuat(localRot1)}`,
    ];

    if (typeName !== "PhysicsFixedJoint") {
      properties.unshift(`uniform token physics:axis = ${formatString(axisChoice.token)}`);
      if (joint.type === "revolute") {
        if (joint.limitLower !== undefined) {
          properties.push(`float physics:lowerLimit = ${formatNumber((joint.limitLower * 180) / Math.PI)}`);
        }
        if (joint.limitUpper !== undefined) {
          properties.push(`float physics:upperLimit = ${formatNumber((joint.limitUpper * 180) / Math.PI)}`);
        }
      } else if (joint.type === "prismatic") {
        if (joint.limitLower !== undefined) {
          properties.push(`float physics:lowerLimit = ${formatNumber(joint.limitLower)}`);
        }
        if (joint.limitUpper !== undefined) {
          properties.push(`float physics:upperLimit = ${formatNumber(joint.limitUpper)}`);
        }
      }
    }

    jointPrims.push({
      name: jointNameMap.get(joint.name) || sanitizeUrdfName(joint.name),
      typeName,
      properties,
    });
    stats.jointsConverted += 1;
  });

  return jointPrims;
};

export function convertURDFToUSD(
  urdfContent: string,
  options: ConvertURDFToUSDOptions = {}
): URDFToUSDConversionResult {
  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    throw new Error(parsed.error || "Invalid URDF.");
  }

  const xmlDoc = parsed.document;
  const robot = xmlDoc.querySelector("robot");
  if (!robot) {
    throw new Error("No <robot> element found in URDF.");
  }

  const warnings: string[] = [];
  const stats: UrdfToUsdStats = {
    linksConverted: 0,
    jointsConverted: 0,
    visualsConverted: 0,
    collisionsConverted: 0,
    inlineMeshesConverted: 0,
    unsupportedMeshes: 0,
  };
  const linkNames = collectLinkNames(xmlDoc);
  const joints = parseJointElements(xmlDoc);
  const linkDataByName = buildLinkDataMap(xmlDoc);
  const linkNameMap = makeUniqueNameMap(linkNames);
  const jointNameMap = makeUniqueNameMap(joints.map((joint) => joint.name));
  const rootTree = buildLinkTree(linkNames, joints);
  const childJointByLink = new Map(joints.map((joint) => [joint.child, joint] as const));
  const linkPathByName = new Map<string, string>();
  const robotPrimName = options.robotPrimName || sanitizeUrdfName(robot.getAttribute("name") || "robot") || "robot";
  const robotPrimPath = `/World/${robotPrimName}`;

  const buildLinkPrim = (node: LinkTreeNode, parentPath: string): UsdPrim | null => {
    const linkData = linkDataByName[node.linkName];
    if (!linkData) {
      warnings.push(`Skipped missing link payload for ${node.linkName}.`);
      return null;
    }
    const linkPath = `${parentPath}/${linkNameMap.get(node.linkName) || sanitizeUrdfName(node.linkName)}`;
    linkPathByName.set(node.linkName, linkPath);
    const parentJoint = childJointByLink.get(node.linkName);
    const transform = parentJoint
      ? {
          translation: parentJoint.originXyz,
          orientation: matrixToQuaternion(rpyToMatrix(parentJoint.originRpy)),
        }
      : undefined;
    const mapped = mapUrdfToUsdPrim(linkData, {
      path: linkNameMap.get(node.linkName) || sanitizeUrdfName(node.linkName),
      translation: transform?.translation,
      orientation: transform?.orientation,
      includeVisuals: options.includeVisuals,
      includeCollisions: options.includeCollisions,
      meshResolver: options.meshResolver,
    });
    warnings.push(...mapped.warnings);
    stats.linksConverted += mapped.stats.linksConverted;
    stats.visualsConverted += mapped.stats.visualsConverted;
    stats.collisionsConverted += mapped.stats.collisionsConverted;
    stats.inlineMeshesConverted += mapped.stats.inlineMeshesConverted;
    stats.unsupportedMeshes += mapped.stats.unsupportedMeshes;
    const childPrims = node.children
      .map((child) => buildLinkPrim(child, linkPath))
      .filter((child): child is UsdPrim => Boolean(child));
    mapped.prim.children = [...(mapped.prim.children ?? []), ...childPrims];
    return mapped.prim;
  };

  const linkPrims = rootTree
    .map((rootNode) => buildLinkPrim(rootNode, robotPrimPath))
    .filter((prim): prim is UsdPrim => Boolean(prim));

  const robotPrim: UsdPrim = {
    name: robotPrimName,
    typeName: "Xform",
    metadata: [`prepend apiSchemas = ["PhysicsArticulationRootAPI"]`],
    children: [
      ...linkPrims,
      ...(options.includeJoints === false
        ? []
        : buildJointPrims(
            joints,
            robotPrimPath,
            linkPathByName,
            rootTree.map((node) => node.linkName),
            jointNameMap,
            warnings,
            stats
          )),
    ],
  };

  const gravityDirection: Vec3 = options.upAxis === "Y" ? [0, -1, 0] : [0, 0, -1];
  const worldPrim: UsdPrim = {
    name: "World",
    typeName: "Xform",
    children: [
      {
        name: "PhysicsScene",
        typeName: "PhysicsScene",
        properties: [
          `vector3f physics:gravityDirection = ${formatVec3(gravityDirection)}`,
          `float physics:gravityMagnitude = 9.81`,
        ],
      },
      robotPrim,
    ],
  };

  const stage = createUsdStage(null, {
    defaultPrim: options.defaultPrim || "World",
    upAxis: options.upAxis || "Z",
    metersPerUnit: options.metersPerUnit ?? 1,
    kilogramsPerUnit: options.kilogramsPerUnit ?? 1,
    rootPrims: [worldPrim],
  });

  return {
    usdContent: stage.toUsda(),
    stage,
    warnings,
    stats,
  };
}

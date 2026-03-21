import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  analyzeUrdf,
  type UrdfAnalysis,
} from "../analysis/analyzeUrdf";
import {
  guessUrdfOrientation,
  type OrientationGuess,
  type OrientationGuessOptions,
} from "../analysis/guessOrientation";
import {
  buildRobotOrientationCard,
  type RobotOrientationCard,
} from "../analysis/robotOrientationCard";
import {
  healthCheckUrdf,
  type HealthCheckFinding,
  type HealthCheckReport,
} from "../analysis/healthCheckUrdf";
import { readMeshBounds, type MeshFileBounds } from "../mesh/meshBoundsNode";
import { parseMeshReference } from "../mesh/meshPaths";
import {
  collectLocalRepositoryFiles,
  type LocalRepositoryFile,
} from "../repository/localRepositoryInspection";
import {
  normalizeRepositoryPath,
  resolveRepositoryFileReference,
} from "../repository/repositoryMeshResolution";
import type { LoadSourceResult } from "../sources/loadSourceNode";
import { parseXml } from "../xmlDom";
import { installNodeDomGlobals } from "./nodeDomRuntime";

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];
type Transform3 = {
  rotation: Mat3;
  translation: Vec3;
};

type JointPose = {
  parentLink: string;
  childLink: string;
  originXyz: Vec3;
  originRpy: Vec3;
};

export type LocalMeshAudit = {
  usedFilesystemChecks: boolean;
  rootPath: string | null;
  urdfPath: string | null;
  totalMeshReferences: number;
  resolvedMeshReferences: string[];
  unresolvedMeshReferences: string[];
  sampledMeshFiles: string[];
  skippedUnsupportedMeshes: string[];
  skippedUnreadableMeshes: string[];
};

export type LoadedSourcePhysicsHealthReport = HealthCheckReport & {
  meshAudit: LocalMeshAudit;
};

export type LoadedSourceOrientationGuess = OrientationGuess & {
  meshAudit: LocalMeshAudit;
};

export type LoadedSourceOrientationCard = RobotOrientationCard & {
  meshAudit: LocalMeshAudit;
};

const IDENTITY_ROTATION: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const IDENTITY_TRANSFORM: Transform3 = {
  rotation: IDENTITY_ROTATION,
  translation: [0, 0, 0],
};

const ensureNodeDomGlobals = () => {
  installNodeDomGlobals();
};

const parseTriplet = (raw: string | null | undefined, fallback: Vec3 = [0, 0, 0]): Vec3 => {
  if (!raw) return fallback;
  const values = raw
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((value) => Number(value));
  return [
    Number.isFinite(values[0]) ? values[0] : fallback[0],
    Number.isFinite(values[1]) ? values[1] : fallback[1],
    Number.isFinite(values[2]) ? values[2] : fallback[2],
  ];
};

const addVec3 = (left: Vec3, right: Vec3): Vec3 => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2],
];

const multiplyMat3 = (left: Mat3, right: Mat3): Mat3 => {
  const result: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      result[i][j] =
        left[i][0] * right[0][j] +
        left[i][1] * right[1][j] +
        left[i][2] * right[2][j];
    }
  }
  return result;
};

const multiplyMat3Vec3 = (matrix: Mat3, vector: Vec3): Vec3 => [
  matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
  matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
  matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
];

const rpyToMatrix = (rpy: Vec3): Mat3 => {
  const [r, p, y] = rpy;
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
};

const composeTransforms = (parent: Transform3, child: Transform3): Transform3 => ({
  rotation: multiplyMat3(parent.rotation, child.rotation),
  translation: addVec3(
    multiplyMat3Vec3(parent.rotation, child.translation),
    parent.translation
  ),
});

const transformPoint = (transform: Transform3, point: Vec3): Vec3 =>
  addVec3(multiplyMat3Vec3(transform.rotation, point), transform.translation);

const resolveLoadedSourceUrdfPath = (source: LoadSourceResult): string | null => {
  if (!source.rootPath || !source.entryPath) return null;
  if (path.isAbsolute(source.entryPath)) {
    const relative = path.relative(source.rootPath, source.entryPath);
    if (!relative || relative.startsWith("..")) {
      return normalizeRepositoryPath(path.basename(source.entryPath));
    }
    return normalizeRepositoryPath(relative);
  }
  return normalizeRepositoryPath(source.entryPath);
};

const collectJointPoses = (xmlDoc: Document): JointPose[] =>
  Array.from(xmlDoc.querySelectorAll("joint")).flatMap((joint) => {
    const parentLink = joint.querySelector("parent")?.getAttribute("link");
    const childLink = joint.querySelector("child")?.getAttribute("link");
    if (!parentLink || !childLink) {
      return [];
    }
    const origin = joint.querySelector("origin");
    return [
      {
        parentLink,
        childLink,
        originXyz: parseTriplet(origin?.getAttribute("xyz")),
        originRpy: parseTriplet(origin?.getAttribute("rpy")),
      },
    ];
  });

const computeLinkWorldTransforms = (
  xmlDoc: Document,
  joints: JointPose[]
): Map<string, Transform3> => {
  const linkNames = Array.from(xmlDoc.querySelectorAll("link"))
    .map((link) => link.getAttribute("name"))
    .filter((value): value is string => Boolean(value));
  const childLinks = new Set(joints.map((joint) => joint.childLink));
  const rootLinks = linkNames.filter((linkName) => !childLinks.has(linkName));
  const transforms = new Map<string, Transform3>();
  rootLinks.forEach((linkName) => {
    transforms.set(linkName, IDENTITY_TRANSFORM);
  });

  let progress = true;
  let passes = 0;
  while (progress && passes < joints.length + 2) {
    progress = false;
    passes += 1;
    joints.forEach((joint) => {
      if (transforms.has(joint.childLink)) {
        return;
      }
      const parentTransform = transforms.get(joint.parentLink);
      if (!parentTransform) {
        return;
      }
      const childTransform = composeTransforms(parentTransform, {
        rotation: rpyToMatrix(joint.originRpy),
        translation: joint.originXyz,
      });
      transforms.set(joint.childLink, childTransform);
      progress = true;
    });
  }

  return transforms;
};

const toFindingSummary = (findings: HealthCheckFinding[]) => ({
  errors: findings.filter((finding) => finding.level === "error").length,
  warnings: findings.filter((finding) => finding.level === "warning").length,
  infos: findings.filter((finding) => finding.level === "info").length,
});

const fileExists = async (absolutePath: string): Promise<boolean> => {
  try {
    const stats = await fs.stat(absolutePath);
    return stats.isFile();
  } catch {
    return false;
  }
};

const resolveLocalMeshReferences = async (
  source: LoadSourceResult,
  analysis: UrdfAnalysis
): Promise<{
  audit: LocalMeshAudit;
  resolvedAbsolutePathByReference: Map<string, string>;
}> => {
  const emptyAudit: LocalMeshAudit = {
    usedFilesystemChecks: false,
    rootPath: source.rootPath ?? null,
    urdfPath: resolveLoadedSourceUrdfPath(source),
    totalMeshReferences: analysis.meshReferences.length,
    resolvedMeshReferences: [],
    unresolvedMeshReferences: [],
    sampledMeshFiles: [],
    skippedUnsupportedMeshes: [],
    skippedUnreadableMeshes: [],
  };

  if (
    (source.source !== "local-file" && source.source !== "local-repo") ||
    !source.rootPath
  ) {
    return {
      audit: emptyAudit,
      resolvedAbsolutePathByReference: new Map<string, string>(),
    };
  }

  const urdfPath = resolveLoadedSourceUrdfPath(source);
  if (!urdfPath) {
    return {
      audit: emptyAudit,
      resolvedAbsolutePathByReference: new Map<string, string>(),
    };
  }

  const files = await collectLocalRepositoryFiles(source.rootPath);
  const resolvedAbsolutePathByReference = new Map<string, string>();
  const resolvedRefs = new Set<string>();
  const unresolvedRefs = new Set<string>();

  for (const meshRef of analysis.meshReferences) {
    if (!meshRef) continue;
    if (
      meshRef.startsWith("http://") ||
      meshRef.startsWith("https://") ||
      meshRef.startsWith("data:")
    ) {
      continue;
    }

    const refInfo = parseMeshReference(meshRef);
    if (refInfo.isAbsoluteFile) {
      const absolutePath = refInfo.path;
      if (await fileExists(absolutePath)) {
        resolvedRefs.add(meshRef);
        resolvedAbsolutePathByReference.set(meshRef, absolutePath);
      } else {
        unresolvedRefs.add(meshRef);
      }
      continue;
    }

    const match = resolveRepositoryFileReference(urdfPath, meshRef, files);
    if (match) {
      const localMatch = match as LocalRepositoryFile;
      resolvedRefs.add(meshRef);
      resolvedAbsolutePathByReference.set(meshRef, localMatch.absolutePath);
    } else {
      unresolvedRefs.add(meshRef);
    }
  }

  return {
    audit: {
      ...emptyAudit,
      usedFilesystemChecks: true,
      resolvedMeshReferences: Array.from(resolvedRefs).sort(),
      unresolvedMeshReferences: Array.from(unresolvedRefs).sort(),
    },
    resolvedAbsolutePathByReference,
  };
};

const buildScaledMeshCorners = (
  bounds: Pick<MeshFileBounds, "min" | "max">,
  scale: Vec3
): Vec3[] => {
  const xs = [bounds.min[0] * scale[0], bounds.max[0] * scale[0]];
  const ys = [bounds.min[1] * scale[1], bounds.max[1] * scale[1]];
  const zs = [bounds.min[2] * scale[2], bounds.max[2] * scale[2]];
  const corners: Vec3[] = [];
  xs.forEach((x) => {
    ys.forEach((y) => {
      zs.forEach((z) => {
        corners.push([x, y, z]);
      });
    });
  });
  return corners;
};

const buildLocalMeshSamplePoints = async (
  source: LoadSourceResult,
  analysis: UrdfAnalysis,
  resolvedAbsolutePathByReference: Map<string, string>
): Promise<{
  points: Vec3[];
  sampledMeshFiles: string[];
  skippedUnsupportedMeshes: string[];
  skippedUnreadableMeshes: string[];
}> => {
  if (
    (source.source !== "local-file" && source.source !== "local-repo") ||
    !source.rootPath
  ) {
    return {
      points: [],
      sampledMeshFiles: [],
      skippedUnsupportedMeshes: [],
      skippedUnreadableMeshes: [],
    };
  }

  ensureNodeDomGlobals();
  const xmlDoc = parseXml(source.urdf);
  const linkTransforms = computeLinkWorldTransforms(xmlDoc, collectJointPoses(xmlDoc));
  const boundsCache = new Map<string, MeshFileBounds>();
  const points: Vec3[] = [];
  const sampledMeshFiles = new Set<string>();
  const skippedUnsupportedMeshes = new Set<string>();
  const skippedUnreadableMeshes = new Set<string>();

  for (const [linkName, linkData] of Object.entries(analysis.linkDataByName)) {
    const linkTransform = linkTransforms.get(linkName) ?? IDENTITY_TRANSFORM;
    const geometries = [...linkData.visuals, ...linkData.collisions];

    for (const entry of geometries) {
      if (entry.geometry.type !== "mesh") {
        continue;
      }

      const meshRef = entry.geometry.params.filename || "";
      const absolutePath = resolvedAbsolutePathByReference.get(meshRef);
      if (!absolutePath) {
        continue;
      }

      let bounds = boundsCache.get(absolutePath);
      if (!bounds) {
        try {
          bounds = readMeshBounds(absolutePath);
          boundsCache.set(absolutePath, bounds);
        } catch (error) {
          if (/unsupported mesh format/i.test((error as Error | undefined)?.message || "")) {
            skippedUnsupportedMeshes.add(meshRef);
          } else {
            skippedUnreadableMeshes.add(meshRef);
          }
          continue;
        }
      }

      sampledMeshFiles.add(meshRef);
      const scale = parseTriplet(entry.geometry.params.scale, [1, 1, 1]);
      const localTransform: Transform3 = {
        rotation: rpyToMatrix(entry.origin.rpy),
        translation: entry.origin.xyz,
      };
      const worldTransform = composeTransforms(linkTransform, localTransform);

      buildScaledMeshCorners(bounds, scale).forEach((corner) => {
        points.push(transformPoint(worldTransform, corner));
      });
    }
  }

  return {
    points,
    sampledMeshFiles: Array.from(sampledMeshFiles).sort(),
    skippedUnsupportedMeshes: Array.from(skippedUnsupportedMeshes).sort(),
    skippedUnreadableMeshes: Array.from(skippedUnreadableMeshes).sort(),
  };
};

const resolveMeshAuditForSource = async (
  source: LoadSourceResult
): Promise<{
  analysis: UrdfAnalysis;
  audit: LocalMeshAudit;
  additionalSamplePoints: Vec3[];
}> => {
  ensureNodeDomGlobals();
  const analysis = analyzeUrdf(source.urdf);
  const { audit, resolvedAbsolutePathByReference } = await resolveLocalMeshReferences(
    source,
    analysis
  );
  const meshSamples = await buildLocalMeshSamplePoints(
    source,
    analysis,
    resolvedAbsolutePathByReference
  );

  return {
    analysis,
    audit: {
      ...audit,
      sampledMeshFiles: meshSamples.sampledMeshFiles,
      skippedUnsupportedMeshes: meshSamples.skippedUnsupportedMeshes,
      skippedUnreadableMeshes: meshSamples.skippedUnreadableMeshes,
    },
    additionalSamplePoints: meshSamples.points,
  };
};

export const checkLoadedSourcePhysicsHealth = async (
  source: LoadSourceResult
): Promise<LoadedSourcePhysicsHealthReport> => {
  ensureNodeDomGlobals();
  const { audit } = await resolveMeshAuditForSource(source);
  const base = healthCheckUrdf(source.urdf);
  const findings = [...base.findings];

  audit.unresolvedMeshReferences.forEach((meshRef) => {
    findings.push({
      level: "error",
      code: "missing-mesh-file",
      context: meshRef,
      message: `Mesh reference "${meshRef}" could not be resolved on disk from the loaded source root.`,
      suggestion: "Repair mesh references or load the robot from the correct repository root before downstream conversion.",
    });
  });

  audit.skippedUnreadableMeshes.forEach((meshRef) => {
    findings.push({
      level: "warning",
      code: "unreadable-mesh-file",
      context: meshRef,
      message: `Mesh reference "${meshRef}" resolved on disk but its bounds could not be sampled.`,
      suggestion: "Convert the mesh to a supported local format or keep orientation inference on analytic geometry only.",
    });
  });

  audit.skippedUnsupportedMeshes.forEach((meshRef) => {
    findings.push({
      level: "info",
      code: "unsupported-mesh-bounds-format",
      context: meshRef,
      message: `Mesh reference "${meshRef}" uses a local format that is not yet sampled for bounds inference.`,
      suggestion: "Use STL, OBJ, or DAE if you want mesh-aware orientation inference from local assets.",
    });
  });

  const summary = toFindingSummary(findings);
  return {
    ...base,
    ok: summary.errors === 0,
    findings,
    summary,
    meshAudit: audit,
  };
};

export const guessLoadedSourceOrientation = async (
  source: LoadSourceResult,
  options: OrientationGuessOptions = {}
): Promise<LoadedSourceOrientationGuess> => {
  const { audit, additionalSamplePoints } = await resolveMeshAuditForSource(source);
  return {
    ...guessUrdfOrientation(source.urdf, {
      ...options,
      additionalSamplePoints: [
        ...(options.additionalSamplePoints ?? []),
        ...additionalSamplePoints,
      ],
    }),
    meshAudit: audit,
  };
};

export const buildLoadedSourceOrientationCard = async (
  source: LoadSourceResult,
  options: OrientationGuessOptions = {}
): Promise<LoadedSourceOrientationCard> => {
  const guess = await guessLoadedSourceOrientation(source, options);
  return {
    ...buildRobotOrientationCard(guess),
    meshAudit: guess.meshAudit,
  };
};

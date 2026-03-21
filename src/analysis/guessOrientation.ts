import { analyzeUrdfDocument, type UrdfAnalysis } from "./analyzeUrdf";
import {
  resolveDirectionCueFromDirectionSamples,
  resolvePrincipalAxesFromDirectionSamples,
  resolveUpCueFromDirectionSamples,
  type DirectionSample,
} from "./orientationCues";
import {
  ORIENTATION_GUESS_CONTRACT,
  type OutputContract,
  withOutputContract,
} from "../contracts/outputContracts";
import type { AxisSpec } from "../utils/rotateRobot";
import {
  getDirectChildrenByTag,
  parseURDF,
  validateURDFDocument,
} from "../parsing/urdfParser";

export type OrientationAxis = "x" | "y" | "z";

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

type Transform3 = {
  rotation: Mat3;
  translation: Vec3;
};

type JointRecord = {
  name: string;
  type: string;
  parentLink: string;
  childLink: string;
  originXyz: Vec3;
  originRpy: Vec3;
  axis: Vec3;
};

export type OrientationSignal = {
  kind:
    | "wheel-axis"
    | "joint-axis"
    | "geometry-span"
    | "pca-forward"
    | "pca-up"
    | "fallback";
  weight: number;
  message: string;
};

export type OrientationEvidence = {
  label: string;
  role: "up" | "forward" | "lateral";
  axis: AxisSpec | null;
  score: number;
  weight: number;
  contribution: number;
  details: string;
};

export type OrientationReport = {
  evidence: OrientationEvidence[];
  conflicts: string[];
};

export type OrientationGuessOptions = {
  targetUpAxis?: OrientationAxis;
  targetForwardAxis?: OrientationAxis;
  additionalSamplePoints?: Array<[number, number, number]>;
};

export type OrientationGuess = {
  schema: typeof ORIENTATION_GUESS_CONTRACT.schema;
  schemaVersion: typeof ORIENTATION_GUESS_CONTRACT.schemaVersion;
  isValid: boolean;
  error?: string;
  robotName: string | null;
  likelyUpAxis: OrientationAxis | null;
  likelyUpDirection: AxisSpec | null;
  likelyForwardAxis: OrientationAxis | null;
  likelyForwardDirection: AxisSpec | null;
  likelyLateralAxis: OrientationAxis | null;
  likelyLateralDirection: AxisSpec | null;
  confidence: number;
  targetUpAxis: OrientationAxis;
  targetForwardAxis: OrientationAxis;
  suggestedRotate90:
    | {
        axes: Array<"x" | "y" | "z">;
        commandSequence: string[];
        note: string;
      }
    | null;
  suggestedApplyOrientation:
    | {
        sourceUpAxis: AxisSpec;
        sourceForwardAxis: AxisSpec;
        targetUpAxis: AxisSpec;
        targetForwardAxis: AxisSpec;
        command: string;
      }
    | null;
  spans: Record<OrientationAxis, number>;
  revoluteAxisVotes: Record<OrientationAxis, number>;
  wheelAxisVotes: Record<OrientationAxis, number>;
  wheelJointNames: string[];
  signals: OrientationSignal[];
  report: OrientationReport;
  assumptions: string[];
};

const buildOrientationGuess = (
  payload: Omit<OrientationGuess, keyof OutputContract<typeof ORIENTATION_GUESS_CONTRACT.schema>>
): OrientationGuess => withOutputContract(ORIENTATION_GUESS_CONTRACT, payload);

const AXES: OrientationAxis[] = ["x", "y", "z"];
const IDENTITY_ROTATION: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const IDENTITY_TRANSFORM: Transform3 = {
  rotation: IDENTITY_ROTATION,
  translation: [0, 0, 0],
};
const WHEEL_HINT_PATTERN = /(wheel|caster|roller|tire|axle|rim)/i;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const zeroVotes = (): Record<OrientationAxis, number> => ({
  x: 0,
  y: 0,
  z: 0,
});

const addVec3 = (left: Vec3, right: Vec3): Vec3 => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2],
];

const subVec3 = (left: Vec3, right: Vec3): Vec3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const scaleVec3 = (vector: Vec3, scale: number): Vec3 => [
  vector[0] * scale,
  vector[1] * scale,
  vector[2] * scale,
];

const magnitude = (vector: Vec3) =>
  Math.sqrt(
    vector[0] * vector[0] +
      vector[1] * vector[1] +
      vector[2] * vector[2]
  );

const normalizeVec3 = (vector: Vec3, fallback: Vec3 = [1, 0, 0]): Vec3 => {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length < 1e-10) {
    return fallback;
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

const dotVec3 = (left: Vec3, right: Vec3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const crossVec3 = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const multiplyMat3 = (left: Mat3, right: Mat3): Mat3 => {
  const result: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += left[i][k] * right[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
};

const multiplyMat3Vec3 = (matrix: Mat3, vector: Vec3): Vec3 => [
  matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
  matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
  matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
];

const composeTransforms = (parent: Transform3, child: Transform3): Transform3 => ({
  rotation: multiplyMat3(parent.rotation, child.rotation),
  translation: addVec3(
    multiplyMat3Vec3(parent.rotation, child.translation),
    parent.translation
  ),
});

const parseTriplet = (raw: string | null, fallback: Vec3 = [0, 0, 0]): Vec3 => {
  if (!raw) return fallback;
  const parts = raw
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((value) => Number(value));
  return [
    Number.isFinite(parts[0]) ? parts[0] : fallback[0],
    Number.isFinite(parts[1]) ? parts[1] : fallback[1],
    Number.isFinite(parts[2]) ? parts[2] : fallback[2],
  ];
};

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

const transformFromOrigin = (xyz: Vec3, rpy: Vec3): Transform3 => ({
  rotation: rpyToMatrix(rpy),
  translation: xyz,
});

const transformPoint = (transform: Transform3, point: Vec3): Vec3 =>
  addVec3(multiplyMat3Vec3(transform.rotation, point), transform.translation);

const getDominantAxis = (
  votes: Record<OrientationAxis, number>,
  exclude: OrientationAxis[] = []
): OrientationAxis | null => {
  const candidates = AXES.filter((axis) => !exclude.includes(axis));
  if (candidates.length === 0) return null;
  let bestAxis: OrientationAxis | null = null;
  let bestValue = -Infinity;
  candidates.forEach((axis) => {
    if (votes[axis] > bestValue) {
      bestValue = votes[axis];
      bestAxis = axis;
    }
  });
  return bestValue > 1e-9 ? bestAxis : null;
};

const getDominantAxisFromVector = (vector: Vec3): OrientationAxis => {
  const absVector: Record<OrientationAxis, number> = {
    x: Math.abs(vector[0]),
    y: Math.abs(vector[1]),
    z: Math.abs(vector[2]),
  };
  return getDominantAxis(absVector) || "x";
};

const getSignedAxisFromVector = (vector: Vec3): AxisSpec => {
  const axis = getDominantAxisFromVector(vector);
  const component =
    axis === "x" ? vector[0] : axis === "y" ? vector[1] : vector[2];
  return `${component < 0 ? "-" : "+"}${axis}` as AxisSpec;
};

const axisSpecFromAxis = (axis: OrientationAxis): AxisSpec =>
  `+${axis}` as AxisSpec;

const axisSpecToVector = (axis: AxisSpec): Vec3 => {
  const sign = axis.startsWith("-") ? -1 : 1;
  const normalized = axis.slice(-1) as OrientationAxis;
  if (normalized === "x") return [sign, 0, 0];
  if (normalized === "y") return [0, sign, 0];
  return [0, 0, sign];
};

const voteAxisFromVector = (
  votes: Record<OrientationAxis, number>,
  vector: Vec3,
  weight: number
) => {
  const normalized = normalizeVec3(vector, [0, 0, 1]);
  votes.x += Math.abs(normalized[0]) * weight;
  votes.y += Math.abs(normalized[1]) * weight;
  votes.z += Math.abs(normalized[2]) * weight;
};

const voteAxisFromScalar = (
  votes: Record<OrientationAxis, number>,
  axis: OrientationAxis,
  weight: number
) => {
  votes[axis] += weight;
};

const axisValuesFromBounds = (
  min: Vec3,
  max: Vec3
): Record<OrientationAxis, number> => ({
  x: Math.max(0, max[0] - min[0]),
  y: Math.max(0, max[1] - min[1]),
  z: Math.max(0, max[2] - min[2]),
});

const makePositiveRotateSequence = (
  fromAxis: OrientationAxis,
  targetAxis: OrientationAxis
): Array<"x" | "y" | "z"> => {
  if (fromAxis === targetAxis) return [];
  if (fromAxis === "y" && targetAxis === "z") return ["x"];
  if (fromAxis === "z" && targetAxis === "y") return ["x", "x", "x"];
  if (fromAxis === "z" && targetAxis === "x") return ["y"];
  if (fromAxis === "x" && targetAxis === "z") return ["y", "y", "y"];
  if (fromAxis === "x" && targetAxis === "y") return ["z"];
  return ["z", "z", "z"];
};

const nameLooksWheelLike = (value: string | null | undefined) =>
  Boolean(value && WHEEL_HINT_PATTERN.test(value));

const isWheelLikeLinkData = (linkData: {
  visuals?: Array<{ geometry: { type: string | null; params: Record<string, string> } }>;
  collisions?: Array<{ geometry: { type: string | null; params: Record<string, string> } }>;
}) => {
  const geometries = [...(linkData.visuals || []), ...(linkData.collisions || [])];
  return geometries.some((entry) => {
    if (entry.geometry.type !== "mesh") return false;
    return nameLooksWheelLike(entry.geometry.params.filename || "");
  });
};

const collectJointRecords = (robot: Element): JointRecord[] =>
  getDirectChildrenByTag(robot, "joint").flatMap((joint) => {
    const name = joint.getAttribute("name");
    const parentLink = joint.querySelector("parent")?.getAttribute("link");
    const childLink = joint.querySelector("child")?.getAttribute("link");
    if (!name || !parentLink || !childLink) {
      return [];
    }
    const type = joint.getAttribute("type") || "fixed";
    const origin = joint.querySelector("origin");
    const axisElement = joint.querySelector("axis");
    return [
      {
        name,
        type,
        parentLink,
        childLink,
        originXyz: parseTriplet(origin?.getAttribute("xyz") ?? null),
        originRpy: parseTriplet(origin?.getAttribute("rpy") ?? null),
        axis:
          type === "fixed" || type === "floating"
            ? [0, 0, 0]
            : normalizeVec3(
                parseTriplet(axisElement?.getAttribute("xyz") ?? null, [1, 0, 0]),
                [1, 0, 0]
              ),
      },
    ];
  });

const computeLinkWorldTransforms = (
  robot: Element,
  joints: JointRecord[]
): {
  linkTransforms: Map<string, Transform3>;
  jointWorldTransforms: Map<string, Transform3>;
  unresolvedJoints: string[];
} => {
  const linkNames = getDirectChildrenByTag(robot, "link")
    .map((link) => link.getAttribute("name"))
    .filter((value): value is string => Boolean(value));

  const childLinks = new Set(joints.map((joint) => joint.childLink));
  const rootLinks = linkNames.filter((name) => !childLinks.has(name));
  const linkTransforms = new Map<string, Transform3>();
  const jointWorldTransforms = new Map<string, Transform3>();

  rootLinks.forEach((linkName) => {
    linkTransforms.set(linkName, IDENTITY_TRANSFORM);
  });

  let progress = true;
  let iterationCount = 0;
  while (progress && iterationCount < joints.length + 2) {
    progress = false;
    iterationCount += 1;
    joints.forEach((joint) => {
      if (jointWorldTransforms.has(joint.name)) return;
      const parentTransform = linkTransforms.get(joint.parentLink);
      if (!parentTransform) return;
      const jointTransform = composeTransforms(
        parentTransform,
        transformFromOrigin(joint.originXyz, joint.originRpy)
      );
      jointWorldTransforms.set(joint.name, jointTransform);
      linkTransforms.set(joint.childLink, jointTransform);
      progress = true;
    });
  }

  const unresolvedJoints = joints
    .filter((joint) => !jointWorldTransforms.has(joint.name))
    .map((joint) => joint.name);

  return { linkTransforms, jointWorldTransforms, unresolvedJoints };
};

const expandBoundsWithPoint = (bounds: { min: Vec3; max: Vec3 }, point: Vec3) => {
  bounds.min = [
    Math.min(bounds.min[0], point[0]),
    Math.min(bounds.min[1], point[1]),
    Math.min(bounds.min[2], point[2]),
  ];
  bounds.max = [
    Math.max(bounds.max[0], point[0]),
    Math.max(bounds.max[1], point[1]),
    Math.max(bounds.max[2], point[2]),
  ];
};

const getContrastRatio = (first: number, second: number) => {
  const maxValue = Math.max(first, second, 1e-9);
  const minValue = Math.min(first, second);
  return clamp((maxValue - minValue) / maxValue, 0, 1);
};

const pushSamplePoint = (
  bounds: { min: Vec3; max: Vec3 },
  rawPoints: Vec3[],
  point: Vec3
) => {
  if (!point.every((value) => Number.isFinite(value))) return;
  rawPoints.push(point);
  expandBoundsWithPoint(bounds, point);
};

const collectGeometrySamplePoints = (
  analysis: UrdfAnalysis,
  linkTransforms: Map<string, Transform3>,
  jointWorldTransforms: Map<string, Transform3>
): { bounds: { min: Vec3; max: Vec3 }; rawPoints: Vec3[] } => {
  const bounds = {
    min: [Infinity, Infinity, Infinity] as Vec3,
    max: [-Infinity, -Infinity, -Infinity] as Vec3,
  };
  const rawPoints: Vec3[] = [];

  Array.from(jointWorldTransforms.values()).forEach((transform) => {
    pushSamplePoint(bounds, rawPoints, transform.translation);
  });

  Object.entries(analysis.linkDataByName).forEach(([linkName, linkData]) => {
    const linkTransform = linkTransforms.get(linkName) || IDENTITY_TRANSFORM;
    if (linkData.inertial) {
      const inertialPoint = transformPoint(
        linkTransform,
        linkData.inertial.origin.xyz
      );
      pushSamplePoint(bounds, rawPoints, inertialPoint);
    }

    const geometries = [...linkData.visuals, ...linkData.collisions];
    geometries.forEach((entry) => {
      const localTransform = transformFromOrigin(entry.origin.xyz, entry.origin.rpy);
      const worldTransform = composeTransforms(linkTransform, localTransform);
      pushSamplePoint(bounds, rawPoints, worldTransform.translation);

      if (entry.geometry.type === "box") {
        const size = parseTriplet(entry.geometry.params.size ?? null, [0, 0, 0]);
        const halfExtents = scaleVec3(size, 0.5);
        const signs = [-1, 1];
        signs.forEach((sx) => {
          signs.forEach((sy) => {
            signs.forEach((sz) => {
              pushSamplePoint(
                bounds,
                rawPoints,
                transformPoint(worldTransform, [
                  halfExtents[0] * sx,
                  halfExtents[1] * sy,
                  halfExtents[2] * sz,
                ])
              );
            });
          });
        });
        return;
      }

      if (entry.geometry.type === "sphere") {
        const radius = Number(entry.geometry.params.radius || "0");
        if (!Number.isFinite(radius) || radius <= 0) return;
        const axes: Vec3[] = [
          [radius, 0, 0],
          [-radius, 0, 0],
          [0, radius, 0],
          [0, -radius, 0],
          [0, 0, radius],
          [0, 0, -radius],
        ];
        axes.forEach((point) => {
          pushSamplePoint(bounds, rawPoints, transformPoint(worldTransform, point));
        });
        return;
      }

      if (entry.geometry.type === "cylinder") {
        const radius = Number(entry.geometry.params.radius || "0");
        const length = Number(entry.geometry.params.length || "0");
        if (
          !Number.isFinite(radius) ||
          radius <= 0 ||
          !Number.isFinite(length) ||
          length <= 0
        ) {
          return;
        }
        const points: Vec3[] = [
          [0, 0, length / 2],
          [0, 0, -length / 2],
          [radius, 0, 0],
          [-radius, 0, 0],
          [0, radius, 0],
          [0, -radius, 0],
        ];
        points.forEach((point) => {
          pushSamplePoint(bounds, rawPoints, transformPoint(worldTransform, point));
        });
      }
    });
  });

  return { bounds, rawPoints };
};

const buildDirectionSamples = (rawPoints: Vec3[]): DirectionSample[] => {
  if (rawPoints.length === 0) return [];
  const centroid = rawPoints.reduce<Vec3>(
    (sum, point) => addVec3(sum, point),
    [0, 0, 0]
  );
  const scaledCentroid = scaleVec3(centroid, 1 / rawPoints.length);
  return rawPoints
    .map((point) => {
      const offset = subVec3(point, scaledCentroid);
      const distance = magnitude(offset);
      return {
        offset,
        distance,
      };
    })
    .filter((sample) => sample.distance > 1e-8);
};

const buildEvidenceItem = (
  label: string,
  role: "up" | "forward" | "lateral",
  axis: AxisSpec | null,
  score: number,
  weight: number,
  aligns: boolean,
  details: string
): OrientationEvidence => ({
  label,
  role,
  axis,
  score: clamp(score, 0, 1),
  weight,
  contribution: (aligns ? 1 : -1) * clamp(score, 0, 1) * weight,
  details,
});

const axisConfidence = (
  axis: OrientationAxis,
  votes: Record<OrientationAxis, number>
) => {
  const total = votes.x + votes.y + votes.z;
  if (total <= 1e-9) return 0;
  return votes[axis] / total;
};

const makeLateralDirection = (
  forwardDirection: AxisSpec,
  upDirection: AxisSpec
): AxisSpec | null => {
  const forwardVector = axisSpecToVector(forwardDirection);
  const upVector = axisSpecToVector(upDirection);
  const lateralVector = crossVec3(upVector, forwardVector);
  if (magnitude(lateralVector) < 1e-8) return null;
  return getSignedAxisFromVector(lateralVector);
};

const describePrincipalAxis = (axis: Vec3 | null | undefined) => {
  if (!axis) return "n/a";
  return `${axis[0].toFixed(3)} ${axis[1].toFixed(3)} ${axis[2].toFixed(3)}`;
};

export function guessUrdfOrientation(
  urdfContent: string,
  options: OrientationGuessOptions = {}
): OrientationGuess {
  const targetUpAxis = options.targetUpAxis ?? "z";
  const targetForwardAxis = options.targetForwardAxis ?? "x";
  const parsed = parseURDF(urdfContent);
  const analysis = analyzeUrdfDocument(parsed.document);
  if (!parsed.isValid || !analysis.isValid) {
    return buildOrientationGuess({
      isValid: false,
      error: parsed.error ?? analysis.error ?? "Invalid URDF",
      robotName: analysis.robotName,
      likelyUpAxis: null,
      likelyUpDirection: null,
      likelyForwardAxis: null,
      likelyForwardDirection: null,
      likelyLateralAxis: null,
      likelyLateralDirection: null,
      confidence: 0,
      targetUpAxis,
      targetForwardAxis,
      suggestedRotate90: null,
      suggestedApplyOrientation: null,
      spans: zeroVotes(),
      revoluteAxisVotes: zeroVotes(),
      wheelAxisVotes: zeroVotes(),
      wheelJointNames: [],
      signals: [],
      report: { evidence: [], conflicts: [] },
      assumptions: [],
    });
  }

  const validation = validateURDFDocument(parsed.document);
  if (!validation.robot) {
    return buildOrientationGuess({
      isValid: false,
      error: validation.error ?? "Invalid URDF",
      robotName: analysis.robotName,
      likelyUpAxis: null,
      likelyUpDirection: null,
      likelyForwardAxis: null,
      likelyForwardDirection: null,
      likelyLateralAxis: null,
      likelyLateralDirection: null,
      confidence: 0,
      targetUpAxis,
      targetForwardAxis,
      suggestedRotate90: null,
      suggestedApplyOrientation: null,
      spans: zeroVotes(),
      revoluteAxisVotes: zeroVotes(),
      wheelAxisVotes: zeroVotes(),
      wheelJointNames: [],
      signals: [],
      report: { evidence: [], conflicts: [] },
      assumptions: [],
    });
  }

  const joints = collectJointRecords(validation.robot);
  const { linkTransforms, jointWorldTransforms, unresolvedJoints } =
    computeLinkWorldTransforms(validation.robot, joints);
  const { bounds: geometryBounds, rawPoints } = collectGeometrySamplePoints(
    analysis,
    linkTransforms,
    jointWorldTransforms
  );
  (options.additionalSamplePoints ?? []).forEach((point) => {
    pushSamplePoint(geometryBounds, rawPoints, point);
  });
  const directionSamples = buildDirectionSamples(rawPoints);

  const spans =
    Number.isFinite(geometryBounds.min[0]) && Number.isFinite(geometryBounds.max[0])
      ? axisValuesFromBounds(geometryBounds.min, geometryBounds.max)
      : zeroVotes();

  const revoluteAxisVotes = zeroVotes();
  const wheelAxisVotes = zeroVotes();
  const wheelJointNames: string[] = [];

  joints.forEach((joint) => {
    if (!["continuous", "revolute", "prismatic"].includes(joint.type)) {
      return;
    }
    const parentTransform = linkTransforms.get(joint.parentLink) || IDENTITY_TRANSFORM;
    const worldAxis = normalizeVec3(
      multiplyMat3Vec3(parentTransform.rotation, joint.axis),
      [1, 0, 0]
    );
    voteAxisFromVector(revoluteAxisVotes, worldAxis, 1);

    const childLinkData = analysis.linkDataByName[joint.childLink];
    const wheelish =
      nameLooksWheelLike(joint.name) ||
      nameLooksWheelLike(joint.childLink) ||
      nameLooksWheelLike(joint.parentLink) ||
      (childLinkData ? isWheelLikeLinkData(childLinkData) : false);

    if (!wheelish) return;
    wheelJointNames.push(joint.name);
    voteAxisFromVector(wheelAxisVotes, worldAxis, 1.5);
    const dominantAxis = getDominantAxisFromVector(worldAxis);
    voteAxisFromScalar(wheelAxisVotes, dominantAxis, 0.5);
  });

  const signals: OrientationSignal[] = [];
  const assumptions = [
    "Orientation is inferred from the nominal zero-pose URDF or expanded XACRO output.",
    "Signed forward and up directions use geometry asymmetry and can stay ambiguous on highly symmetric robots.",
  ];
  if (unresolvedJoints.length > 0) {
    assumptions.push(
      `Some joint transforms could not be chained cleanly: ${unresolvedJoints.join(", ")}.`
    );
  }

  const wheelAxis = getDominantAxis(wheelAxisVotes);
  const wheelVoteTotal = wheelAxisVotes.x + wheelAxisVotes.y + wheelAxisVotes.z;
  const wheelDominance =
    wheelAxis && wheelVoteTotal > 1e-9 ? wheelAxisVotes[wheelAxis] / wheelVoteTotal : 0;

  let likelyUpAxis: OrientationAxis | null = null;
  let likelyForwardAxis: OrientationAxis | null = null;
  let likelyLateralAxis: OrientationAxis | null = null;
  let confidence = 0.2;

  if (wheelAxis && wheelVoteTotal >= 1.5) {
    const remainingAxes = AXES.filter((axis) => axis !== wheelAxis);
    const [firstAxis, secondAxis] = remainingAxes;
    const firstSpan = spans[firstAxis];
    const secondSpan = spans[secondAxis];

    likelyLateralAxis = wheelAxis;
    likelyForwardAxis = firstSpan >= secondSpan ? firstAxis : secondAxis;
    likelyUpAxis = likelyForwardAxis === firstAxis ? secondAxis : firstAxis;

    confidence = clamp(
      0.45 +
        wheelDominance * 0.35 +
        getContrastRatio(spans[likelyForwardAxis], spans[likelyUpAxis]) * 0.2,
      0,
      0.98
    );

    signals.push({
      kind: "wheel-axis",
      weight: confidence,
      message: `Detected wheel-like joints around ${wheelAxis.toUpperCase()} and used the remaining span contrast to infer forward/up.`,
    });
  } else {
    const maxSpan = Math.max(spans.x, spans.y, spans.z, 1e-9);
    const minSpan = Math.min(spans.x, spans.y, spans.z);
    const spanRange = Math.max(maxSpan - minSpan, 1e-9);
    const revoluteVoteTotal =
      revoluteAxisVotes.x + revoluteAxisVotes.y + revoluteAxisVotes.z;
    const upScores = zeroVotes();

    AXES.forEach((axis) => {
      const inverseSpanScore = clamp((maxSpan - spans[axis]) / spanRange, 0, 1);
      const revoluteScore =
        revoluteVoteTotal > 1e-9 ? revoluteAxisVotes[axis] / revoluteVoteTotal : 0;
      upScores[axis] = inverseSpanScore * 0.6 + revoluteScore * 0.4;
    });

    likelyUpAxis = getDominantAxis(upScores) || "z";
    likelyForwardAxis = getDominantAxis(spans, [likelyUpAxis]) || targetForwardAxis;
    likelyLateralAxis =
      AXES.find(
        (axis) => axis !== likelyUpAxis && axis !== likelyForwardAxis
      ) || null;

    const scoreValues = AXES.map((axis) => upScores[axis]).sort((left, right) => right - left);
    const upMargin = scoreValues[0] - (scoreValues[1] ?? 0);
    confidence = clamp(
      0.3 +
        upMargin * 0.4 +
        getContrastRatio(
          spans[likelyForwardAxis],
          likelyLateralAxis ? spans[likelyLateralAxis] : 0
        ) * 0.3,
      0,
      0.9
    );

    signals.push({
      kind: "joint-axis",
      weight: revoluteVoteTotal > 0 ? 0.35 : 0.15,
      message:
        "Used revolute/prismatic axis votes and nominal geometry span because no strong wheel pattern was detected.",
    });
  }

  signals.push({
    kind: "geometry-span",
    weight: 0.25,
    message: `Nominal span estimate: X=${spans.x.toFixed(3)}, Y=${spans.y.toFixed(3)}, Z=${spans.z.toFixed(3)}.`,
  });

  if (!likelyUpAxis || !likelyForwardAxis || !likelyLateralAxis) {
    likelyUpAxis = targetUpAxis;
    likelyForwardAxis = targetForwardAxis;
    likelyLateralAxis =
      AXES.find((axis) => axis !== likelyUpAxis && axis !== likelyForwardAxis) || "y";
    confidence = clamp(confidence, 0, 0.4);
    signals.push({
      kind: "fallback",
      weight: 0.1,
      message: "Fell back to target basis because the inferred basis stayed underconstrained.",
    });
  }

  const principalAxes = resolvePrincipalAxesFromDirectionSamples(directionSamples);
  const pcaForwardCue = resolveDirectionCueFromDirectionSamples(directionSamples);
  const pcaUpCue = pcaForwardCue
    ? resolveUpCueFromDirectionSamples(
        directionSamples,
        pcaForwardCue.axis as Vec3,
        axisSpecToVector(axisSpecFromAxis(likelyUpAxis))
      )
    : null;

  const evidence: OrientationEvidence[] = [];
  const conflicts: string[] = [];

  const revoluteVoteTotal = revoluteAxisVotes.x + revoluteAxisVotes.y + revoluteAxisVotes.z;
  const maxSpan = Math.max(spans.x, spans.y, spans.z, 1e-9);
  const spanRange = Math.max(maxSpan - Math.min(spans.x, spans.y, spans.z), 1e-9);

  if (wheelAxis) {
    const aligns = wheelAxis === likelyLateralAxis;
    evidence.push(
      buildEvidenceItem(
        "Wheel axis inference",
        "lateral",
        axisSpecFromAxis(wheelAxis),
        wheelDominance,
        0.55,
        aligns,
        wheelJointNames.length > 0
          ? `Wheel-like joints: ${wheelJointNames.join(", ")}.`
          : "Wheel-like joint naming or mesh hints were detected."
      )
    );
    if (!aligns && wheelDominance > 0.35) {
      conflicts.push(
        `Wheel-like joints point to ${wheelAxis.toUpperCase()} as the lateral axis, but the final basis selected ${likelyLateralAxis?.toUpperCase()}.`
      );
    }
  }

  const geometryUpScore = clamp((maxSpan - spans[likelyUpAxis]) / spanRange, 0, 1);
  evidence.push(
    buildEvidenceItem(
      "Geometry span",
      "up",
      axisSpecFromAxis(likelyUpAxis),
      geometryUpScore,
      0.28,
      true,
      `Shortest span was treated as the best up candidate: X=${spans.x.toFixed(3)}, Y=${spans.y.toFixed(3)}, Z=${spans.z.toFixed(3)}.`
    )
  );

  const forwardContrastScore = likelyLateralAxis
    ? clamp(spans[likelyForwardAxis] / Math.max(spans[likelyLateralAxis], 1e-9), 0, 1)
    : 0;
  evidence.push(
    buildEvidenceItem(
      "Geometry span",
      "forward",
      axisSpecFromAxis(likelyForwardAxis),
      forwardContrastScore,
      0.18,
      true,
      likelyLateralAxis
        ? `Forward span ${likelyForwardAxis.toUpperCase()}=${spans[likelyForwardAxis].toFixed(3)} vs lateral ${likelyLateralAxis.toUpperCase()}=${spans[likelyLateralAxis].toFixed(3)}.`
        : "Used span contrast to keep the longest non-up axis as forward."
    )
  );

  if (revoluteVoteTotal > 1e-9) {
    evidence.push(
      buildEvidenceItem(
        "Joint axis votes",
        "up",
        axisSpecFromAxis(likelyUpAxis),
        axisConfidence(likelyUpAxis, revoluteAxisVotes),
        0.22,
        true,
        `Revolute/prismatic world-axis votes: X=${revoluteAxisVotes.x.toFixed(2)}, Y=${revoluteAxisVotes.y.toFixed(2)}, Z=${revoluteAxisVotes.z.toFixed(2)}.`
      )
    );
  }

  let likelyForwardDirection: AxisSpec = axisSpecFromAxis(likelyForwardAxis);
  let likelyUpDirection: AxisSpec = axisSpecFromAxis(likelyUpAxis);

  if (pcaForwardCue) {
    const pcaForwardAxis = getDominantAxisFromVector(pcaForwardCue.axis as Vec3);
    const aligns = pcaForwardAxis === likelyForwardAxis;
    evidence.push(
      buildEvidenceItem(
        "PCA forward cue",
        "forward",
        getSignedAxisFromVector(pcaForwardCue.axis as Vec3),
        pcaForwardCue.confidence,
        0.3,
        aligns,
        `Principal-axis asymmetry suggests forward ${getSignedAxisFromVector(
          pcaForwardCue.axis as Vec3
        )}. Primary basis=${describePrincipalAxis(principalAxes?.primary as Vec3 | undefined)}.`
      )
    );
    signals.push({
      kind: "pca-forward",
      weight: pcaForwardCue.confidence,
      message: `PCA direction cue suggests forward ${getSignedAxisFromVector(
        pcaForwardCue.axis as Vec3
      )}.`,
    });
    if (aligns) {
      likelyForwardDirection = getSignedAxisFromVector(pcaForwardCue.axis as Vec3);
    } else if (pcaForwardCue.confidence >= 0.45) {
      conflicts.push(
        `PCA forward cue suggests ${getSignedAxisFromVector(
          pcaForwardCue.axis as Vec3
        )}, while the final basis kept ${likelyForwardAxis.toUpperCase()} as forward.`
      );
    }
  }

  if (pcaUpCue) {
    const pcaUpAxis = getDominantAxisFromVector(pcaUpCue.axis as Vec3);
    const aligns = pcaUpAxis === likelyUpAxis;
    evidence.push(
      buildEvidenceItem(
        "PCA up cue",
        "up",
        getSignedAxisFromVector(pcaUpCue.axis as Vec3),
        pcaUpCue.confidence,
        0.26,
        aligns,
        `Principal-axis shape suggests up ${getSignedAxisFromVector(
          pcaUpCue.axis as Vec3
        )}. Secondary basis=${describePrincipalAxis(principalAxes?.secondary as Vec3 | undefined)}, tertiary basis=${describePrincipalAxis(principalAxes?.tertiary as Vec3 | undefined)}.`
      )
    );
    signals.push({
      kind: "pca-up",
      weight: pcaUpCue.confidence,
      message: `PCA direction cue suggests up ${getSignedAxisFromVector(
        pcaUpCue.axis as Vec3
      )}.`,
    });
    if (aligns) {
      likelyUpDirection = getSignedAxisFromVector(pcaUpCue.axis as Vec3);
    } else if (pcaUpCue.confidence >= 0.45) {
      conflicts.push(
        `PCA up cue suggests ${getSignedAxisFromVector(
          pcaUpCue.axis as Vec3
        )}, while the final basis kept ${likelyUpAxis.toUpperCase()} as up.`
      );
    }
  }

  if (likelyUpAxis === likelyForwardAxis) {
    likelyForwardAxis =
      getDominantAxis(spans, [likelyUpAxis]) || targetForwardAxis;
    likelyForwardDirection = axisSpecFromAxis(likelyForwardAxis);
    conflicts.push(
      "Forward and up converged to the same dominant axis after sign inference, so forward was reselected from the remaining span basis."
    );
  }

  const likelyLateralDirection =
    makeLateralDirection(likelyForwardDirection, likelyUpDirection) ||
    axisSpecFromAxis(likelyLateralAxis);
  likelyLateralAxis = likelyLateralDirection
    ? (likelyLateralDirection.slice(-1) as OrientationAxis)
    : likelyLateralAxis;
  likelyUpAxis = likelyUpDirection.slice(-1) as OrientationAxis;
  likelyForwardAxis = likelyForwardDirection.slice(-1) as OrientationAxis;

  const alignedPcaBonus =
    (pcaForwardCue &&
    getDominantAxisFromVector(pcaForwardCue.axis as Vec3) === likelyForwardAxis
      ? pcaForwardCue.confidence * 0.12
      : 0) +
    (pcaUpCue &&
    getDominantAxisFromVector(pcaUpCue.axis as Vec3) === likelyUpAxis
      ? pcaUpCue.confidence * 0.1
      : 0);
  const conflictPenalty = Math.min(conflicts.length * 0.05, 0.18);
  confidence = clamp(confidence + alignedPcaBonus - conflictPenalty, 0, 0.99);

  const rotateAxes = makePositiveRotateSequence(likelyUpAxis, targetUpAxis);
  const suggestedRotate90 =
    rotateAxes.length > 0
      ? {
          axes: rotateAxes,
          commandSequence: rotateAxes.map(
            (axis, index) =>
              `ilu rotate-90 --urdf robot.urdf --axis ${axis} --out robot.rotated${index + 1}.urdf`
          ),
          note:
            "This only aligns the guessed up-axis to the target up-axis. Use apply-orientation when forward sign matters too.",
        }
      : null;

  return buildOrientationGuess({
    isValid: true,
    robotName: analysis.robotName,
    likelyUpAxis,
    likelyUpDirection,
    likelyForwardAxis,
    likelyForwardDirection,
    likelyLateralAxis,
    likelyLateralDirection,
    confidence,
    targetUpAxis,
    targetForwardAxis,
    suggestedRotate90,
    suggestedApplyOrientation: {
      sourceUpAxis: likelyUpDirection,
      sourceForwardAxis: likelyForwardDirection,
      targetUpAxis: axisSpecFromAxis(targetUpAxis),
      targetForwardAxis: axisSpecFromAxis(targetForwardAxis),
      command: `ilu apply-orientation --urdf robot.urdf --source-up ${likelyUpDirection} --source-forward ${likelyForwardDirection} --target-up +${targetUpAxis} --target-forward +${targetForwardAxis} --out robot.oriented.urdf`,
    },
    spans,
    revoluteAxisVotes,
    wheelAxisVotes,
    wheelJointNames,
    signals,
    report: {
      evidence,
      conflicts,
    },
    assumptions,
  });
}

export const guessOrientation = guessUrdfOrientation;

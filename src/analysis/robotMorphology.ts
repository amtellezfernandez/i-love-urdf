import type { UrdfAnalysis } from "./analyzeUrdf";
import type { JointHierarchyNode } from "../parsing/parseJointHierarchy";

const CONTROLLABLE_JOINT_TYPES = new Set([
  "revolute",
  "continuous",
  "prismatic",
  "planar",
  "floating",
]);

const JOINT_TYPE_DOF: Record<string, number> = {
  revolute: 1,
  continuous: 1,
  prismatic: 1,
  planar: 2,
  floating: 6,
};

const BODY_LINK_PATTERN = /(base|body|torso|chassis|trunk|pelvis)/i;
const ARM_SIGNAL_PATTERN = /(arm|shoulder|elbow|wrist|gripper|hand|tool|flange|ee)/i;
const LEG_SIGNAL_PATTERN = /(leg|hip|knee|ankle|thigh|calf|foot|paw)/i;
const WHEEL_SIGNAL_PATTERN = /(wheel|caster|drive|tire)/i;
const SIDE_LEFT_PATTERN = /(?:^|[_\-\s])(left|l)(?:$|[_\-\s])/i;
const SIDE_RIGHT_PATTERN = /(?:^|[_\-\s])(right|r)(?:$|[_\-\s])/i;
const SIDE_FRONT_PATTERN = /(?:^|[_\-\s])(front|f)(?:$|[_\-\s])/i;
const SIDE_REAR_PATTERN = /(?:^|[_\-\s])(rear|back|rr)(?:$|[_\-\s])/i;

const MAX_BODY_DEPTH_FROM_ROOT = 1;
const WHEEL_CONTINUOUS_RATIO_THRESHOLD = 0.6;
const WHEEL_DEPTH_THRESHOLD = 1;
const WHEEL_BRANCH_MAX_JOINTS = 2;

export type RobotStructureBranchKind = "arm" | "leg" | "wheel";
export type RobotStructureSideHint = "left" | "right" | "front" | "rear" | "center";

export type RobotStructureLabels = {
  linkByName: Record<string, string>;
  jointByName: Record<string, string>;
};

export type RobotMorphologyFamily =
  | "humanoid-like"
  | "quadruped-like"
  | "mobile-manipulator"
  | "wheeled"
  | "manipulator"
  | "legged"
  | "object-like"
  | "other";

export type RobotMorphologySummary = {
  structureLabels: RobotStructureLabels;
  linkCount: number;
  jointCount: number;
  controllableJointCount: number;
  dofCount: number;
  armCount: number;
  legCount: number;
  wheelCount: number;
  primaryFamily: RobotMorphologyFamily;
  families: RobotMorphologyFamily[];
  isHumanoidLike: boolean;
  isQuadrupedLike: boolean;
  isWheeledLike: boolean;
  isMobileManipulatorLike: boolean;
};

type BranchInfo = {
  rootJoint: JointHierarchyNode;
  linkNames: Set<string>;
  jointNames: Set<string>;
  kind: RobotStructureBranchKind;
  side: RobotStructureSideHint;
};

type StructureComputation = {
  labels: RobotStructureLabels;
  armCount: number;
  legCount: number;
  wheelCount: number;
};

const createEmptyStructureLabels = (): RobotStructureLabels => ({
  linkByName: {},
  jointByName: {},
});

const sideSortOrder: Record<RobotStructureSideHint, number> = {
  left: 0,
  right: 1,
  front: 2,
  rear: 3,
  center: 4,
};

export const isControllableJointType = (jointType: string): boolean =>
  CONTROLLABLE_JOINT_TYPES.has(String(jointType || "").toLowerCase());

export const getJointTypeDegreesOfFreedom = (jointType: string): number =>
  JOINT_TYPE_DOF[String(jointType || "").toLowerCase()] ?? 0;

const getSideScore = (names: string[], pattern: RegExp): number =>
  names.reduce((score, value) => score + (pattern.test(value) ? 1 : 0), 0);

const getSideHint = (names: string[]): RobotStructureSideHint => {
  const leftScore = getSideScore(names, SIDE_LEFT_PATTERN);
  const rightScore = getSideScore(names, SIDE_RIGHT_PATTERN);
  const frontScore = getSideScore(names, SIDE_FRONT_PATTERN);
  const rearScore = getSideScore(names, SIDE_REAR_PATTERN);
  const maxScore = Math.max(leftScore, rightScore, frontScore, rearScore);
  if (maxScore <= 0) return "center";
  if (leftScore === maxScore) return "left";
  if (rightScore === maxScore) return "right";
  if (frontScore === maxScore) return "front";
  return "rear";
};

const computeLinkDepthFromRoots = (
  roots: string[],
  parentToJoints: Map<string, JointHierarchyNode[]>
): Map<string, number> => {
  const depthByLink = new Map<string, number>();
  const queue: Array<{ link: string; depth: number }> = roots.map((link) => ({
    link,
    depth: 0,
  }));

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const existingDepth = depthByLink.get(next.link);
    if (existingDepth !== undefined && existingDepth <= next.depth) {
      continue;
    }
    depthByLink.set(next.link, next.depth);
    const children = parentToJoints.get(next.link) ?? [];
    children.forEach((joint) => {
      queue.push({ link: joint.childLink, depth: next.depth + 1 });
    });
  }

  return depthByLink;
};

const collectBranchRootJoints = (
  bodyLinks: Set<string>,
  parentToJoints: Map<string, JointHierarchyNode[]>
): JointHierarchyNode[] => {
  const branchRoots = new Map<string, JointHierarchyNode>();

  bodyLinks.forEach((startLink) => {
    const stack = [startLink];
    const visitedLinks = new Set<string>();
    while (stack.length > 0) {
      const currentLink = stack.pop();
      if (!currentLink || visitedLinks.has(currentLink)) continue;
      visitedLinks.add(currentLink);
      const joints = parentToJoints.get(currentLink) ?? [];
      joints.forEach((joint) => {
        if (isControllableJointType(joint.type)) {
          branchRoots.set(joint.jointName, joint);
          return;
        }
        stack.push(joint.childLink);
      });
    }
  });

  return Array.from(branchRoots.values());
};

const classifyBranch = (
  rootJoint: JointHierarchyNode,
  parentToJoints: Map<string, JointHierarchyNode[]>
): BranchInfo => {
  const linkNames = new Set<string>();
  const jointNames = new Set<string>();
  const queue: JointHierarchyNode[] = [rootJoint];
  const visitedJoints = new Set<string>();
  let maxDepth = 0;
  let totalJoints = 0;
  let continuousJoints = 0;
  let armSignals = 0;
  let legSignals = 0;
  let wheelSignals = 0;

  while (queue.length > 0) {
    const joint = queue.shift();
    if (!joint || visitedJoints.has(joint.jointName)) continue;
    visitedJoints.add(joint.jointName);
    jointNames.add(joint.jointName);
    linkNames.add(joint.childLink);
    totalJoints += 1;
    maxDepth = Math.max(maxDepth, joint.depth - rootJoint.depth + 1);
    if (joint.type.toLowerCase() === "continuous") {
      continuousJoints += 1;
    }
    if (ARM_SIGNAL_PATTERN.test(joint.jointName) || ARM_SIGNAL_PATTERN.test(joint.childLink)) {
      armSignals += 1;
    }
    if (LEG_SIGNAL_PATTERN.test(joint.jointName) || LEG_SIGNAL_PATTERN.test(joint.childLink)) {
      legSignals += 1;
    }
    if (WHEEL_SIGNAL_PATTERN.test(joint.jointName) || WHEEL_SIGNAL_PATTERN.test(joint.childLink)) {
      wheelSignals += 1;
    }

    const children = parentToJoints.get(joint.childLink) ?? [];
    children.forEach((childJoint) => queue.push(childJoint));
  }

  const continuousRatio = totalJoints > 0 ? continuousJoints / totalJoints : 0;
  const wheelByTopologyFallback =
    continuousRatio >= WHEEL_CONTINUOUS_RATIO_THRESHOLD &&
    maxDepth <= WHEEL_DEPTH_THRESHOLD &&
    totalJoints <= WHEEL_BRANCH_MAX_JOINTS &&
    armSignals === 0 &&
    legSignals === 0;
  const kind: RobotStructureBranchKind =
    wheelSignals > 0 || wheelByTopologyFallback
      ? "wheel"
      : legSignals > armSignals
        ? "leg"
        : "arm";

  return {
    rootJoint,
    linkNames,
    jointNames,
    kind,
    side: getSideHint([...jointNames, ...linkNames]),
  };
};

const sortBranches = (lhs: BranchInfo, rhs: BranchInfo): number => {
  if (lhs.kind !== rhs.kind) return lhs.kind.localeCompare(rhs.kind);
  if (lhs.side !== rhs.side) return sideSortOrder[lhs.side] - sideSortOrder[rhs.side];
  return lhs.rootJoint.order - rhs.rootJoint.order;
};

const computeRobotStructure = (
  analysis: UrdfAnalysis | null | undefined
): StructureComputation => {
  const labels = createEmptyStructureLabels();
  if (!analysis?.isValid) {
    return { labels, armCount: 0, legCount: 0, wheelCount: 0 };
  }

  const orderedJoints = analysis.jointHierarchy.orderedJoints ?? [];
  if (orderedJoints.length === 0) {
    const firstRoot = analysis.rootLinks[0];
    if (firstRoot) {
      labels.linkByName[firstRoot] = "base";
    }
    return { labels, armCount: 0, legCount: 0, wheelCount: 0 };
  }

  const parentToJoints = new Map<string, JointHierarchyNode[]>();
  orderedJoints.forEach((joint) => {
    const byParent = parentToJoints.get(joint.parentLink);
    if (byParent) {
      byParent.push(joint);
    } else {
      parentToJoints.set(joint.parentLink, [joint]);
    }
  });

  const roots = analysis.rootLinks.length > 0 ? analysis.rootLinks : [analysis.linkNames[0] ?? ""];
  const validRoots = roots.map((name) => name.trim()).filter(Boolean);
  const depthByLink = computeLinkDepthFromRoots(validRoots, parentToJoints);

  const bodyLinks = new Set<string>(validRoots);
  analysis.linkNames.forEach((linkName) => {
    const depth = depthByLink.get(linkName);
    if (
      depth !== undefined &&
      depth <= MAX_BODY_DEPTH_FROM_ROOT &&
      BODY_LINK_PATTERN.test(linkName)
    ) {
      bodyLinks.add(linkName);
    }
  });

  validRoots.forEach((linkName, index) => {
    labels.linkByName[linkName] = index === 0 ? "base" : `body${index}`;
  });

  Array.from(bodyLinks)
    .filter((name) => !labels.linkByName[name])
    .sort((lhs, rhs) => lhs.localeCompare(rhs))
    .forEach((linkName, index) => {
      labels.linkByName[linkName] = `body${index + 1}`;
    });

  let branchRoots = collectBranchRootJoints(bodyLinks, parentToJoints);
  if (branchRoots.length === 0) {
    branchRoots = orderedJoints.filter((joint) => isControllableJointType(joint.type));
  }

  const branches = branchRoots.map((rootJoint) => classifyBranch(rootJoint, parentToJoints));
  const kindCounts: Record<RobotStructureBranchKind, number> = {
    arm: 0,
    leg: 0,
    wheel: 0,
  };

  branches.sort(sortBranches).forEach((branch) => {
    kindCounts[branch.kind] += 1;
    const label = `${branch.kind}${kindCounts[branch.kind]}`;
    branch.linkNames.forEach((linkName) => {
      if (!labels.linkByName[linkName]) {
        labels.linkByName[linkName] = label;
      }
    });
    branch.jointNames.forEach((jointName) => {
      if (!labels.jointByName[jointName]) {
        labels.jointByName[jointName] = label;
      }
    });
  });

  return {
    labels,
    armCount: kindCounts.arm,
    legCount: kindCounts.leg,
    wheelCount: kindCounts.wheel,
  };
};

const buildMorphologyFamilies = ({
  armCount,
  legCount,
  wheelCount,
}: {
  armCount: number;
  legCount: number;
  wheelCount: number;
}): {
  primaryFamily: RobotMorphologyFamily;
  families: RobotMorphologyFamily[];
  isHumanoidLike: boolean;
  isQuadrupedLike: boolean;
  isWheeledLike: boolean;
  isMobileManipulatorLike: boolean;
} => {
  const families: RobotMorphologyFamily[] = [];
  const isQuadrupedLike = legCount >= 4;
  const isHumanoidLike = legCount >= 2 && armCount >= 1 && !isQuadrupedLike;
  const isWheeledLike = wheelCount > 0;
  const isMobileManipulatorLike = wheelCount > 0 && armCount > 0;
  const isManipulatorLike = armCount > 0 && legCount === 0 && wheelCount === 0;
  const isLeggedLike = legCount > 0 && !isQuadrupedLike && !isHumanoidLike;
  const isObjectLike = armCount === 0 && legCount === 0 && wheelCount === 0;

  if (isHumanoidLike) families.push("humanoid-like");
  if (isQuadrupedLike) families.push("quadruped-like");
  if (isMobileManipulatorLike) families.push("mobile-manipulator");
  if (isWheeledLike) families.push("wheeled");
  if (isManipulatorLike) families.push("manipulator");
  if (isLeggedLike) families.push("legged");
  if (isObjectLike) families.push("object-like");
  if (families.length === 0) families.push("other");

  return {
    primaryFamily: families[0] ?? "other",
    families,
    isHumanoidLike,
    isQuadrupedLike,
    isWheeledLike,
    isMobileManipulatorLike,
  };
};

export const buildRobotStructureLabels = (
  analysis: UrdfAnalysis | null | undefined
): RobotStructureLabels => {
  return computeRobotStructure(analysis).labels;
};

export const analyzeRobotMorphology = (
  analysis: UrdfAnalysis | null | undefined
): RobotMorphologySummary => {
  const structure = computeRobotStructure(analysis);
  const orderedJoints = analysis?.jointHierarchy.orderedJoints ?? [];
  const controllableJointCount = orderedJoints.filter((joint) =>
    isControllableJointType(joint.type)
  ).length;
  const dofCount = orderedJoints.reduce(
    (total, joint) => total + getJointTypeDegreesOfFreedom(joint.type),
    0
  );
  const families = buildMorphologyFamilies({
    armCount: structure.armCount,
    legCount: structure.legCount,
    wheelCount: structure.wheelCount,
  });

  return {
    structureLabels: structure.labels,
    linkCount: analysis?.linkNames.length ?? 0,
    jointCount: orderedJoints.length,
    controllableJointCount,
    dofCount,
    armCount: structure.armCount,
    legCount: structure.legCount,
    wheelCount: structure.wheelCount,
    primaryFamily: families.primaryFamily,
    families: families.families,
    isHumanoidLike: families.isHumanoidLike,
    isQuadrupedLike: families.isQuadrupedLike,
    isWheeledLike: families.isWheeledLike,
    isMobileManipulatorLike: families.isMobileManipulatorLike,
  };
};

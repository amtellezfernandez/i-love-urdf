import type { UrdfAnalysis } from "./analyzeUrdf";
import { analyzeRobotMorphology, type RobotMorphologySummary } from "./robotMorphology";
import {
  ROBOT_MORPHOLOGY_CARD_CONTRACT,
  type OutputContract,
  withOutputContract,
} from "../contracts/outputContracts";

export type RobotMorphologyTagName =
  | "humanoid"
  | "quadruped"
  | "biped"
  | "wheeled"
  | "mobile-manipulator"
  | "manipulator"
  | "dual-arm"
  | "end-effector"
  | "aerial"
  | "object"
  | "legged"
  | "dog-like"
  | "other";

export type RobotMorphologyDisplayTag =
  | "Arm"
  | "Biped"
  | "Dual Arm"
  | "Drone"
  | "End Effector"
  | "Humanoid"
  | "Mobile Manipulator"
  | "Quadruped"
  | "Wheeled"
  | "Object"
  | "Other";

export type RobotMorphologyTagConfidence = "high" | "medium" | "low";
export type RobotMorphologyTagSource = "structure" | "name" | "hybrid";

export type RobotMorphologyTag = {
  tag: RobotMorphologyTagName;
  confidence: RobotMorphologyTagConfidence;
  source: RobotMorphologyTagSource;
  reasons: string[];
};

export type RobotMorphologyCard = {
  schema: typeof ROBOT_MORPHOLOGY_CARD_CONTRACT.schema;
  schemaVersion: typeof ROBOT_MORPHOLOGY_CARD_CONTRACT.schemaVersion;
  robotName: string | null;
  nameHints: string[];
  summary: RobotMorphologySummary;
  canonicalTags: RobotMorphologyTagName[];
  displayTags: RobotMorphologyDisplayTag[];
  tags: RobotMorphologyTag[];
};

export type RobotMorphologyCardOptions = {
  nameHints?: string[];
  includeNameHeuristics?: boolean;
};

const END_EFFECTOR_HINTS = ["hand", "gripper", "finger", "eef", "end effector", "tool", "flange"];
const AERIAL_HINTS = ["drone", "quadrotor", "uav", "crazyflie", "aerial"];
const HUMANOID_HINTS = ["humanoid", "atlas", "digit", "icub", "nao", "valkyrie", "talos", "g1_", "h1_"];
const DOG_LIKE_HINTS = ["dog", "canine", "spot", "go1", "go2", "a1", "aliengo", "laikago", "anymal", "mini cheetah"];
const OBJECT_HINTS = ["object", "cube", "box", "sphere", "cylinder", "table", "desk", "chair", "bottle", "can", "cup", "plate", "pan", "obstacle", "prop"];

const TAG_ORDER: readonly RobotMorphologyTagName[] = [
  "humanoid",
  "quadruped",
  "dog-like",
  "biped",
  "mobile-manipulator",
  "wheeled",
  "dual-arm",
  "manipulator",
  "end-effector",
  "aerial",
  "object",
  "legged",
  "other",
] as const;

const DISPLAY_TAG_BY_CANONICAL: Partial<Record<RobotMorphologyTagName, RobotMorphologyDisplayTag>> = {
  humanoid: "Humanoid",
  quadruped: "Quadruped",
  biped: "Biped",
  wheeled: "Wheeled",
  "mobile-manipulator": "Mobile Manipulator",
  manipulator: "Arm",
  "dual-arm": "Dual Arm",
  "end-effector": "End Effector",
  aerial: "Drone",
  object: "Object",
  other: "Other",
};

const CONFIDENCE_RANK: Record<RobotMorphologyTagConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const normalizeHints = (robotName: string | null, nameHints: string[] | undefined): string[] =>
  Array.from(
    new Set(
      [robotName, ...(nameHints ?? [])]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const toSearchSeed = (nameHints: string[]): string =>
  nameHints
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");

const hasAnyToken = (seed: string, tokens: readonly string[]) =>
  tokens.some((token) => seed.includes(token));

const mergeSource = (
  left: RobotMorphologyTagSource,
  right: RobotMorphologyTagSource
): RobotMorphologyTagSource => {
  if (left === right) return left;
  return "hybrid";
};

const sortTags = (tags: Iterable<RobotMorphologyTag>): RobotMorphologyTag[] => {
  const order = new Map(TAG_ORDER.map((tag, index) => [tag, index] as const));
  return Array.from(tags).sort((left, right) => {
    const leftOrder = order.get(left.tag) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.tag) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.tag.localeCompare(right.tag);
  });
};

const toDisplayTags = (canonicalTags: readonly RobotMorphologyTagName[]): RobotMorphologyDisplayTag[] => {
  const mapped = Array.from(
    new Set(
      canonicalTags
        .map((tag) => DISPLAY_TAG_BY_CANONICAL[tag])
        .filter((tag): tag is RobotMorphologyDisplayTag => Boolean(tag))
    )
  );

  const withoutHumanoidConflicts = mapped.includes("Humanoid")
    ? mapped.filter((tag) => tag !== "Biped" && tag !== "Arm" && tag !== "Dual Arm" && tag !== "End Effector")
    : mapped;
  const withoutEndEffectorConflicts = withoutHumanoidConflicts.includes("End Effector")
    ? withoutHumanoidConflicts.filter((tag) => tag !== "Arm" && tag !== "Dual Arm")
    : withoutHumanoidConflicts;

  return withoutEndEffectorConflicts.length > 0 ? withoutEndEffectorConflicts : ["Other"];
};

const buildRobotMorphologyContract = (
  payload: Omit<RobotMorphologyCard, keyof OutputContract<typeof ROBOT_MORPHOLOGY_CARD_CONTRACT.schema>>
): RobotMorphologyCard => withOutputContract(ROBOT_MORPHOLOGY_CARD_CONTRACT, payload);

export const buildRobotMorphologyCard = (
  analysis: UrdfAnalysis | null | undefined,
  options: RobotMorphologyCardOptions = {}
): RobotMorphologyCard => {
  const summary = analyzeRobotMorphology(analysis);
  const robotName = analysis?.robotName ?? null;
  const nameHints = normalizeHints(robotName, options.nameHints);
  const seed = toSearchSeed(nameHints);
  const includeNameHeuristics = options.includeNameHeuristics !== false;
  const byTag = new Map<RobotMorphologyTagName, RobotMorphologyTag>();

  const addTag = (
    tag: RobotMorphologyTagName,
    confidence: RobotMorphologyTagConfidence,
    source: RobotMorphologyTagSource,
    reasons: string[]
  ) => {
    const nextReasons = Array.from(new Set(reasons.map((reason) => reason.trim()).filter(Boolean)));
    if (nextReasons.length === 0) return;
    const existing = byTag.get(tag);
    if (!existing) {
      byTag.set(tag, { tag, confidence, source, reasons: nextReasons });
      return;
    }

    byTag.set(tag, {
      tag,
      confidence:
        CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[existing.confidence]
          ? confidence
          : existing.confidence,
      source: mergeSource(existing.source, source),
      reasons: Array.from(new Set([...existing.reasons, ...nextReasons])),
    });
  };

  if (summary.isHumanoidLike) {
    addTag("humanoid", "high", "structure", [
      `Detected ${summary.legCount} leg branches and ${summary.armCount} arm branches.`,
    ]);
  }
  if (summary.isQuadrupedLike) {
    addTag("quadruped", "high", "structure", [
      `Detected ${summary.legCount} leg branches.`,
    ]);
  }
  if (summary.legCount >= 2 && summary.legCount < 4) {
    addTag("biped", "high", "structure", [
      `Detected ${summary.legCount} leg branches.`,
    ]);
  }
  if (summary.isWheeledLike) {
    addTag("wheeled", "high", "structure", [
      `Detected ${summary.wheelCount} wheel branches.`,
    ]);
  }
  if (summary.isMobileManipulatorLike) {
    addTag("mobile-manipulator", "high", "structure", [
      `Detected ${summary.armCount} arm branches and ${summary.wheelCount} wheel branches.`,
    ]);
  }
  if (summary.armCount > 0 && summary.legCount === 0 && summary.wheelCount === 0) {
    addTag("manipulator", "high", "structure", [
      `Detected ${summary.armCount} arm branches with no legs or wheels.`,
    ]);
  }
  if (summary.armCount === 2 && summary.legCount === 0 && summary.wheelCount === 0) {
    addTag("dual-arm", "high", "structure", [
      "Detected exactly two arm branches and no legs or wheels.",
    ]);
  }
  if (summary.legCount > 0 && !summary.isHumanoidLike && !summary.isQuadrupedLike) {
    addTag("legged", "high", "structure", [
      `Detected ${summary.legCount} leg branches.`,
    ]);
  }
  if (summary.armCount === 0 && summary.legCount === 0 && summary.wheelCount === 0) {
    addTag("object", "high", "structure", [
      "Detected no arm, leg, or wheel branches.",
    ]);
  }

  if (includeNameHeuristics && seed) {
    if (hasAnyToken(seed, HUMANOID_HINTS)) {
      addTag("humanoid", summary.isHumanoidLike ? "high" : "medium", summary.isHumanoidLike ? "hybrid" : "name", [
        `Name hints matched humanoid tokens in "${seed}".`,
      ]);
    }
    if (hasAnyToken(seed, END_EFFECTOR_HINTS)) {
      addTag("end-effector", "medium", "name", [
        `Name hints matched end-effector tokens in "${seed}".`,
      ]);
    }
    if (hasAnyToken(seed, AERIAL_HINTS)) {
      addTag("aerial", "medium", "name", [
        `Name hints matched aerial tokens in "${seed}".`,
      ]);
    }
    if (summary.isQuadrupedLike && hasAnyToken(seed, DOG_LIKE_HINTS)) {
      addTag("dog-like", "medium", "hybrid", [
        `Detected a quadruped structure and dog-like name hints in "${seed}".`,
      ]);
    }
    if (summary.armCount === 0 && summary.legCount === 0 && summary.wheelCount === 0 && hasAnyToken(seed, OBJECT_HINTS)) {
      addTag("object", "medium", "name", [
        `Name hints matched object tokens in "${seed}".`,
      ]);
    }
  }

  if (byTag.size === 0) {
    addTag("other", "low", "structure", [
      "No morphology rule matched strongly enough to assign a more specific tag.",
    ]);
  }

  const tags = sortTags(byTag.values());
  const canonicalTags = tags.map((tag) => tag.tag);
  const displayTags = toDisplayTags(canonicalTags);

  return buildRobotMorphologyContract({
    robotName,
    nameHints,
    summary,
    canonicalTags,
    displayTags,
    tags,
  });
};

export const getRobotMorphologyDisplayTags = (
  card: RobotMorphologyCard
): RobotMorphologyDisplayTag[] => [...card.displayTags];

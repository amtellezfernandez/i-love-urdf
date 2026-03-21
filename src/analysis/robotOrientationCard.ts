import {
  guessUrdfOrientation,
  type OrientationAxis,
  type OrientationGuess,
  type OrientationGuessOptions,
  type OrientationReport,
  type OrientationSignal,
} from "./guessOrientation";
import {
  ROBOT_ORIENTATION_CARD_CONTRACT,
  type OutputContract,
  withOutputContract,
} from "../contracts/outputContracts";
import type { AxisSpec } from "../utils/rotateRobot";

export type RobotOrientationClassification =
  | "x-up"
  | "y-up"
  | "z-up"
  | "underconstrained";

export type RobotOrientationCardSummary = {
  classification: RobotOrientationClassification;
  confidence: number;
  likelyUpAxis: OrientationAxis | null;
  likelyUpDirection: AxisSpec | null;
  likelyForwardAxis: OrientationAxis | null;
  likelyForwardDirection: AxisSpec | null;
  likelyLateralAxis: OrientationAxis | null;
  likelyLateralDirection: AxisSpec | null;
};

export type RobotOrientationCard = {
  schema: typeof ROBOT_ORIENTATION_CARD_CONTRACT.schema;
  schemaVersion: typeof ROBOT_ORIENTATION_CARD_CONTRACT.schemaVersion;
  isValid: boolean;
  error?: string;
  robotName: string | null;
  summary: RobotOrientationCardSummary;
  targetBasis: {
    up: AxisSpec;
    forward: AxisSpec;
  };
  spans: Record<OrientationAxis, number>;
  jointAxisVotes: Record<OrientationAxis, number>;
  wheelAxisVotes: Record<OrientationAxis, number>;
  wheelJointNames: string[];
  signals: OrientationSignal[];
  report: OrientationReport;
  assumptions: string[];
  suggestedRotate90: OrientationGuess["suggestedRotate90"];
  suggestedApplyOrientation: OrientationGuess["suggestedApplyOrientation"];
};

const buildRobotOrientationContract = (
  payload: Omit<RobotOrientationCard, keyof OutputContract<typeof ROBOT_ORIENTATION_CARD_CONTRACT.schema>>
): RobotOrientationCard => withOutputContract(ROBOT_ORIENTATION_CARD_CONTRACT, payload);

const axisSpecFromAxis = (axis: OrientationAxis): AxisSpec => `+${axis}` as AxisSpec;

const summarizeClassification = (
  likelyUpAxis: OrientationAxis | null
): RobotOrientationClassification => {
  if (!likelyUpAxis) return "underconstrained";
  return `${likelyUpAxis}-up` as RobotOrientationClassification;
};

const emptyVotes = (): Record<OrientationAxis, number> => ({
  x: 0,
  y: 0,
  z: 0,
});

export const buildRobotOrientationCard = (
  guessOrUrdf: OrientationGuess | string,
  options: OrientationGuessOptions = {}
): RobotOrientationCard => {
  const guess =
    typeof guessOrUrdf === "string"
      ? guessUrdfOrientation(guessOrUrdf, options)
      : guessOrUrdf;

  return buildRobotOrientationContract({
    isValid: guess.isValid,
    error: guess.error,
    robotName: guess.robotName,
    summary: {
      classification: guess.isValid
        ? summarizeClassification(guess.likelyUpAxis)
        : "underconstrained",
      confidence: guess.confidence,
      likelyUpAxis: guess.likelyUpAxis,
      likelyUpDirection: guess.likelyUpDirection,
      likelyForwardAxis: guess.likelyForwardAxis,
      likelyForwardDirection: guess.likelyForwardDirection,
      likelyLateralAxis: guess.likelyLateralAxis,
      likelyLateralDirection: guess.likelyLateralDirection,
    },
    targetBasis: {
      up: axisSpecFromAxis(guess.targetUpAxis),
      forward: axisSpecFromAxis(guess.targetForwardAxis),
    },
    spans: guess.spans ?? emptyVotes(),
    jointAxisVotes: guess.revoluteAxisVotes ?? emptyVotes(),
    wheelAxisVotes: guess.wheelAxisVotes ?? emptyVotes(),
    wheelJointNames: guess.wheelJointNames ?? [],
    signals: guess.signals ?? [],
    report: guess.report ?? { evidence: [], conflicts: [] },
    assumptions: guess.assumptions ?? [],
    suggestedRotate90: guess.suggestedRotate90,
    suggestedApplyOrientation: guess.suggestedApplyOrientation,
  });
};

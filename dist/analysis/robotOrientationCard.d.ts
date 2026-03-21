import { type OrientationAxis, type OrientationGuess, type OrientationGuessOptions, type OrientationReport, type OrientationSignal } from "./guessOrientation";
import { ROBOT_ORIENTATION_CARD_CONTRACT } from "../contracts/outputContracts";
import type { AxisSpec } from "../utils/rotateRobot";
export type RobotOrientationClassification = "x-up" | "y-up" | "z-up" | "underconstrained";
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
export declare const buildRobotOrientationCard: (guessOrUrdf: OrientationGuess | string, options?: OrientationGuessOptions) => RobotOrientationCard;

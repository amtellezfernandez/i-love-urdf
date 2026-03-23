import type { UrdfAnalysis } from "./analyzeUrdf";
import { type RobotMorphologySummary } from "./robotMorphology";
import { ROBOT_MORPHOLOGY_CARD_CONTRACT } from "../contracts/outputContracts";
export type RobotMorphologyTagName = "humanoid" | "quadruped" | "biped" | "wheeled" | "mobile-manipulator" | "manipulator" | "dual-arm" | "end-effector" | "aerial" | "object" | "legged" | "dog-like" | "other";
export type RobotMorphologyDisplayTag = "Arm" | "Biped" | "Dual Arm" | "Drone" | "End Effector" | "Humanoid" | "Mobile Manipulator" | "Quadruped" | "Wheeled" | "Object" | "Other";
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
export declare const buildRobotMorphologyCard: (analysis: UrdfAnalysis | null | undefined, options?: RobotMorphologyCardOptions) => RobotMorphologyCard;
export declare const getRobotMorphologyDisplayTags: (card: RobotMorphologyCard) => RobotMorphologyDisplayTag[];

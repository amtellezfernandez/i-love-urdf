import type { UrdfAnalysis } from "./analyzeUrdf";
export type RobotStructureBranchKind = "arm" | "leg" | "wheel";
export type RobotStructureSideHint = "left" | "right" | "front" | "rear" | "center";
export type RobotStructureLabels = {
    linkByName: Record<string, string>;
    jointByName: Record<string, string>;
};
export type RobotMorphologyFamily = "humanoid-like" | "quadruped-like" | "mobile-manipulator" | "wheeled" | "manipulator" | "legged" | "object-like" | "other";
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
export declare const isControllableJointType: (jointType: string) => boolean;
export declare const getJointTypeDegreesOfFreedom: (jointType: string) => number;
export declare const buildRobotStructureLabels: (analysis: UrdfAnalysis | null | undefined) => RobotStructureLabels;
export declare const analyzeRobotMorphology: (analysis: UrdfAnalysis | null | undefined) => RobotMorphologySummary;

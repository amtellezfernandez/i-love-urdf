import { type UrdfAnalysis } from "./analyzeUrdf";
export type RobotType = "arm" | "wheeled" | "humanoid" | "other";
export declare const identifyRobotType: (analysisOrUrdf: UrdfAnalysis | string | null | undefined) => RobotType;

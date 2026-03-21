import { analyzeUrdf, type UrdfAnalysis } from "./analyzeUrdf";
import { analyzeRobotMorphology } from "./robotMorphology";

export type RobotType = "arm" | "wheeled" | "humanoid" | "other";

export const identifyRobotType = (
  analysisOrUrdf: UrdfAnalysis | string | null | undefined
): RobotType => {
  const analysis =
    typeof analysisOrUrdf === "string" ? analyzeUrdf(analysisOrUrdf) : analysisOrUrdf;
  const morphology = analyzeRobotMorphology(analysis);

  if (morphology.isHumanoidLike) {
    return "humanoid";
  }
  if (morphology.isWheeledLike) {
    return "wheeled";
  }
  if (morphology.armCount > 0 && morphology.legCount === 0) {
    return "arm";
  }
  return "other";
};

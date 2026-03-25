import * as fs from "node:fs";
import { fixMeshPaths } from "../mesh/fixMeshPaths";
import type {
  OrientationSuggestedActionPlan,
  RepositoryPreviewCandidate,
  ShellState,
  SuggestedActionPrompt,
} from "./cliShellTypes";

export const buildRepairMeshRefsSuggestion = (): SuggestedActionPrompt => ({
  kind: "repair-mesh-refs",
  summary: "mesh references need attention",
  recommendedLine: "recommended: repair mesh references",
  prompt: "repair mesh references now?",
  acceptLabel: "repair mesh references",
  acceptOptionLabel: "Repair now",
  skipOptionLabel: "Not now",
});

export const buildFixMeshPathsSuggestion = (): SuggestedActionPrompt => ({
  kind: "fix-mesh-paths",
  summary: "mesh paths need attention",
  recommendedLine: "recommended: repair mesh paths",
  prompt: "repair mesh paths now?",
  acceptLabel: "repair mesh paths",
  acceptOptionLabel: "Repair now",
  skipOptionLabel: "Not now",
});

export const buildReviewAttentionSuggestion = (): SuggestedActionPrompt => ({
  kind: "review-attention",
  summary: "some checks still need attention",
  recommendedLine: "recommended: review the remaining issues",
  prompt: "review the remaining issues now?",
  acceptLabel: "review the remaining issues",
  acceptOptionLabel: "Review now",
  skipOptionLabel: "Later",
});

const formatOrientationTarget = (
  plan: Pick<OrientationSuggestedActionPlan, "targetUpAxis" | "targetForwardAxis">
): string => `${plan.targetUpAxis}-up / ${plan.targetForwardAxis}-forward`;

export const buildAlignOrientationSuggestion = (
  plan: OrientationSuggestedActionPlan
): SuggestedActionPrompt => ({
  kind: "align-orientation",
  summary: `orientation differs from ${formatOrientationTarget(plan)}`,
  recommendedLine: `recommended: align orientation to ${formatOrientationTarget(plan)}`,
  prompt: `align orientation to ${formatOrientationTarget(plan)} now?`,
  acceptLabel: "align orientation",
  acceptOptionLabel: "Align now",
  skipOptionLabel: "Not now",
  orientationPlan: plan,
});

const describeVisualizerPreflightTarget = (suggestedAction: SuggestedActionPrompt): string =>
  suggestedAction.kind === "repair-mesh-refs"
    ? "repairing mesh references"
    : suggestedAction.kind === "fix-mesh-paths"
      ? "repairing mesh paths"
      : suggestedAction.kind === "align-orientation"
        ? "aligning orientation"
        : suggestedAction.kind === "apply-repo-fixes"
          ? "applying shared repo fixes"
          : "editing the working copy";

export const shouldPromptVisualizerBeforeSuggestedAction = (
  suggestedAction: SuggestedActionPrompt
): boolean =>
  suggestedAction.kind !== "review-attention" && suggestedAction.kind !== "open-visualizer";

export const buildOpenVisualizerSuggestion = (
  followUpAction: SuggestedActionPrompt | null = null
): SuggestedActionPrompt =>
  followUpAction
    ? {
        kind: "open-visualizer",
        summary: followUpAction.summary,
        recommendedLine: `recommended: open URDF Studio before ${describeVisualizerPreflightTarget(followUpAction)}`,
        prompt: `open URDF Studio before ${describeVisualizerPreflightTarget(followUpAction)}?`,
        acceptLabel: "open URDF Studio",
        acceptOptionLabel: "Open Studio",
        skipOptionLabel: "Continue here",
        followUpAction,
      }
    : {
        kind: "open-visualizer",
        summary: "review the robot in URDF Studio",
        recommendedLine: "recommended: open URDF Studio for this robot",
        prompt: "open URDF Studio for this robot now?",
        acceptLabel: "open URDF Studio",
        acceptOptionLabel: "Open Studio",
        skipOptionLabel: "Not now",
        followUpAction: null,
      };

export const buildInstallVisualizerSuggestion = (
  mode: "install" | "setup",
  followUpAction: SuggestedActionPrompt | null = null
): SuggestedActionPrompt =>
  mode === "install"
    ? {
        kind: "install-visualizer",
        summary: "URDF Studio is not installed yet",
        recommendedLine: "recommended: install URDF Studio to visualize your modifications",
        prompt: "install URDF Studio to visualize your modifications?",
        acceptLabel: "install URDF Studio",
        acceptOptionLabel: "Install Studio",
        skipOptionLabel: "Not now",
        followUpAction,
      }
    : {
        kind: "install-visualizer",
        summary: "URDF Studio still needs setup",
        recommendedLine: "recommended: finish URDF Studio setup to visualize your modifications",
        prompt: "finish URDF Studio setup to visualize your modifications?",
        acceptLabel: "finish URDF Studio setup",
        acceptOptionLabel: "Set Up Studio",
        skipOptionLabel: "Not now",
        followUpAction,
      };

export const formatAttentionDetail = (message: string, context?: string): string =>
  context ? `${context}: ${message}` : message;

export const appendSuggestedActionLines = (
  lines: string[],
  suggestedAction: SuggestedActionPrompt | null,
  fallbackLine: string
) => {
  if (!suggestedAction) {
    lines.push(fallbackLine);
    return;
  }

  if (!lines.includes(suggestedAction.summary)) {
    lines.push(suggestedAction.summary);
  }
  lines.push(suggestedAction.recommendedLine);
};

export const getValidationStatusLine = (payload: {
  isValid: boolean;
  issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
}): string =>
  payload.isValid && payload.issues.length === 0
    ? "validation passed"
    : "validation needs attention";

export const getHealthStatusLine = (payload: {
  ok: boolean;
  summary: { errors: number; warnings: number; infos: number };
}): string =>
  payload.ok && payload.summary.errors === 0 && payload.summary.warnings === 0
    ? "health check passed"
    : "health check needs attention";

export const collectAttentionLines = (
  validationIssues: Array<{ level: "error" | "warning"; message: string; context?: string }> = [],
  healthFindings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }> = [],
  limit = 2
): string[] => {
  const lines: string[] = [];
  for (const issue of validationIssues) {
    const line = formatAttentionDetail(issue.message, issue.context);
    if (!lines.includes(line)) {
      lines.push(line);
    }
    if (lines.length >= limit) {
      return lines;
    }
  }

  for (const finding of healthFindings) {
    if (finding.level === "info") {
      continue;
    }
    const line = formatAttentionDetail(finding.message, finding.context);
    if (!lines.includes(line)) {
      lines.push(line);
    }
    if (lines.length >= limit) {
      return lines;
    }
  }

  return lines;
};

export const hasAttentionIssues = (payload: {
  validation: {
    isValid: boolean;
    issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
  };
  health: {
    summary: { errors: number; warnings: number; infos: number };
  };
}): boolean =>
  !payload.validation.isValid ||
  payload.validation.issues.length > 0 ||
  payload.health.summary.errors > 0 ||
  payload.health.summary.warnings > 0;

const getOrientationSuggestion = (orientationGuess: {
  isValid?: boolean;
  likelyUpDirection?: string | null;
  likelyForwardDirection?: string | null;
  targetUpAxis?: string | null;
  targetForwardAxis?: string | null;
  confidence?: number;
  suggestedApplyOrientation?: {
    sourceUpAxis?: string | null;
    sourceForwardAxis?: string | null;
    targetUpAxis?: string | null;
    targetForwardAxis?: string | null;
  } | null;
} | null | undefined): SuggestedActionPrompt | null => {
  if (
    !orientationGuess?.isValid ||
    !orientationGuess.suggestedApplyOrientation?.sourceUpAxis ||
    !orientationGuess.suggestedApplyOrientation?.sourceForwardAxis ||
    !orientationGuess.suggestedApplyOrientation?.targetUpAxis ||
    !orientationGuess.suggestedApplyOrientation?.targetForwardAxis
  ) {
    return null;
  }

  const confidence =
    typeof orientationGuess.confidence === "number" && Number.isFinite(orientationGuess.confidence)
      ? orientationGuess.confidence
      : 0;
  if (confidence < 0.72) {
    return null;
  }

  const sourceUpAxis = orientationGuess.suggestedApplyOrientation.sourceUpAxis;
  const sourceForwardAxis = orientationGuess.suggestedApplyOrientation.sourceForwardAxis;
  const targetUpAxis = orientationGuess.suggestedApplyOrientation.targetUpAxis;
  const targetForwardAxis = orientationGuess.suggestedApplyOrientation.targetForwardAxis;

  if (sourceUpAxis === targetUpAxis && sourceForwardAxis === targetForwardAxis) {
    return null;
  }

  return buildAlignOrientationSuggestion({
    sourceUpAxis,
    sourceForwardAxis,
    targetUpAxis,
    targetForwardAxis,
  });
};

export const detectSuggestedAction = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  options: {
    selectedCandidate?: RepositoryPreviewCandidate;
    urdfPath?: string;
    orientationGuess?: {
      isValid?: boolean;
      likelyUpDirection?: string | null;
      likelyForwardDirection?: string | null;
      targetUpAxis?: string | null;
      targetForwardAxis?: string | null;
      confidence?: number;
      suggestedApplyOrientation?: {
        sourceUpAxis?: string | null;
        sourceForwardAxis?: string | null;
        targetUpAxis?: string | null;
        targetForwardAxis?: string | null;
      } | null;
    } | null;
  } = {}
): SuggestedActionPrompt | null => {
  const source = state.loadedSource;
  if (
    (options.selectedCandidate?.unresolvedMeshReferenceCount ?? 0) > 0 &&
    source &&
    (source.source === "local-repo" || source.source === "github") &&
    source.repositoryUrdfPath
  ) {
    return buildRepairMeshRefsSuggestion();
  }

  const urdfPath = options.urdfPath ?? source?.urdfPath ?? state.lastUrdfPath;
  if (urdfPath && source?.source === "local-file") {
    try {
      const currentUrdf = fs.readFileSync(urdfPath, "utf8");
      const fixed = fixMeshPaths(currentUrdf);
      if (fixed.corrections.length > 0) {
        return buildFixMeshPathsSuggestion();
      }
    } catch {
      return null;
    }
  }

  return getOrientationSuggestion(options.orientationGuess);
};

export const getCandidateDetails = (
  candidate: RepositoryPreviewCandidate
): string[] => {
  const details = [candidate.inspectionMode === "xacro-source" ? "xacro" : "urdf"];
  if ((candidate.unresolvedMeshReferenceCount ?? 0) > 0) {
    details.push("mesh refs need attention");
  }
  const requiredXacroArgs = (candidate.xacroArgs ?? []).filter((arg) => arg.isRequired).length;
  if (requiredXacroArgs > 0) {
    details.push("requires xacro args");
  } else if ((candidate.xacroArgs?.length ?? 0) > 0) {
    details.push("xacro options");
  }
  return details;
};

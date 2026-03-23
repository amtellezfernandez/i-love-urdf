import * as fs from "node:fs";
import { fixMeshPaths } from "../mesh/fixMeshPaths";
import type {
  RepositoryPreviewCandidate,
  ShellState,
  SuggestedActionPrompt,
} from "./cliShellTypes";

export const buildRepairMeshRefsSuggestion = (): SuggestedActionPrompt => ({
  kind: "repair-mesh-refs",
  summary: "mesh references need attention",
  recommendedLine: "recommended: repair mesh references",
  prompt: "repair mesh references now?  Enter yes  Esc not now",
  acceptLabel: "repair mesh references",
});

export const buildFixMeshPathsSuggestion = (): SuggestedActionPrompt => ({
  kind: "fix-mesh-paths",
  summary: "mesh paths need attention",
  recommendedLine: "recommended: repair mesh paths",
  prompt: "repair mesh paths now?  Enter yes  Esc not now",
  acceptLabel: "repair mesh paths",
});

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

export const detectSuggestedAction = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  options: {
    selectedCandidate?: RepositoryPreviewCandidate;
    urdfPath?: string;
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
  if (!urdfPath || source?.source !== "local-file") {
    return null;
  }

  try {
    const currentUrdf = fs.readFileSync(urdfPath, "utf8");
    const fixed = fixMeshPaths(currentUrdf);
    return fixed.corrections.length > 0 ? buildFixMeshPathsSuggestion() : null;
  } catch {
    return null;
  }
};

export const getCandidateDetails = (
  candidate: RepositoryPreviewCandidate
): string[] => {
  const details = [candidate.inspectionMode === "xacro-source" ? "xacro" : "urdf"];
  if ((candidate.unresolvedMeshReferenceCount ?? 0) > 0) {
    details.push("mesh refs need attention");
  }
  if ((candidate.xacroArgs?.length ?? 0) > 0) {
    details.push("needs xacro args");
  }
  return details;
};

import type { AutoPreviewPanel, RepoSourceContext, SuggestedActionPrompt } from "../commands/cliShellTypes";

const formatCount = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

export const buildApplyRepoFixesSuggestion = (): SuggestedActionPrompt => ({
  kind: "apply-repo-fixes",
  summary: "shared repo fixes are available",
  recommendedLine: "recommended: apply shared safe fixes across the repo",
  prompt: "apply shared safe fixes across the repo now?",
  acceptLabel: "apply shared repo fixes",
  acceptOptionLabel: "Apply now",
  skipOptionLabel: "Not now",
});

export const summarizeRepoFixesPreviewPanel = (repoContext: RepoSourceContext): AutoPreviewPanel => {
  const { payload } = repoContext;
  const meshRefCandidates = payload.candidates.filter((candidate) => (candidate.unresolvedMeshReferenceCount ?? 0) > 0);
  const requiredXacroCandidates = payload.candidates.filter((candidate) =>
    (candidate.xacroArgs ?? []).some((arg) => arg.isRequired)
  );
  const lines: string[] = [`source ${repoContext.sourceLabel}`];

  lines.push(`detected ${formatCount(payload.candidateCount, "robot entrypoint")}`);
  if (meshRefCandidates.length > 0) {
    lines.push(`${meshRefCandidates.length} can repair mesh references safely`);
  }
  if (requiredXacroCandidates.length > 0) {
    lines.push(`${requiredXacroCandidates.length} need manual xacro args and may stay for review`);
  }
  if (meshRefCandidates.length === 0 && requiredXacroCandidates.length === 0) {
    lines.push("no obvious shared repo issues showed up in the first preview");
  }
  lines.push("ilu will scan each robot, apply safe repo-wide fixes, and leave anything risky for review");
  if (meshRefCandidates[0]?.path) {
    lines.push(`example ${meshRefCandidates[0].path}: mesh refs need attention`);
  } else if (requiredXacroCandidates[0]?.path) {
    lines.push(`example ${requiredXacroCandidates[0].path}: requires manual xacro args`);
  }
  lines.push("after that, ilu will say if the repo is ready for /gallery or which robot still needs review");

  return {
    title: "repo fixes",
    kind: "info",
    lines,
  };
};

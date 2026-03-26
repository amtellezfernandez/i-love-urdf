import * as process from "node:process";
import {
  ROOT_GUIDANCE,
  SHELL_BRAND,
  SHELL_THEME,
  stripAnsi,
} from "./cliShellConfig";
import { getCandidateDetails } from "./cliShellRecommendations";
import type {
  AutoPreviewPanel,
  CandidatePickerState,
  RepoIntentPromptState,
  ShellContextRow,
  ShellFeedbackKind,
  ShellOutputPanel,
} from "./cliShellTypes";

export const createOutputPanel = (
  title: string,
  content: string,
  kind: Exclude<ShellFeedbackKind, "warning"> = "info"
): ShellOutputPanel => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, entries) => line.length > 0 || index < entries.length - 1);
  if (lines.length === 0) {
    return null;
  }

  return {
    title,
    lines: lines.slice(-10),
    kind,
  };
};

export const getPanelLineIcon = (line: string): string => {
  const normalized = stripAnsi(line).trim().toLowerCase();
  if (
    normalized === "looks ready" ||
    normalized === "no obvious problems found" ||
    normalized.startsWith("repaired ") ||
    normalized === "working copy ready" ||
    normalized.startsWith("validation passed") ||
    normalized.startsWith("health check passed")
  ) {
    return "✓";
  }

  if (
    normalized.startsWith("best next step") ||
    normalized.startsWith("recommended:") ||
    normalized.startsWith("then /") ||
    normalized.startsWith("next /")
  ) {
    return "→";
  }

  if (
    normalized.startsWith("validation found") ||
    normalized.startsWith("health check found") ||
    normalized.startsWith("error ")
  ) {
    return "!";
  }

  if (normalized.startsWith("warning ")) {
    return "!";
  }

  return "•";
};

export const renderPanelLine = (
  line: string,
  kind: Exclude<ShellFeedbackKind, "warning">
): string => {
  const renderText = kind === "error" ? SHELL_THEME.error : SHELL_THEME.muted;
  return `${SHELL_THEME.icon(getPanelLineIcon(line))} ${renderText(line)}`;
};

export const printSectionTitle = (title: string) => {
  process.stdout.write(`\n${SHELL_THEME.section(title)}\n`);
};

export const printOutputPanel = (panel: AutoPreviewPanel | ShellOutputPanel) => {
  if (!panel) {
    return;
  }

  printSectionTitle(panel.title);
  for (const line of panel.lines) {
    process.stdout.write(`  ${renderPanelLine(line, panel.kind)}\n`);
  }
};

export const printCandidatePicker = (picker: CandidatePickerState) => {
  printSectionTitle("choose");
  process.stdout.write(
    `  ${SHELL_THEME.muted("type a number, press Enter for the highlighted match, or paste a repo entry path")}\n`
  );
  for (const [index, candidate] of picker.candidates.slice(0, 9).entries()) {
    const prefix =
      index === picker.selectedIndex ? SHELL_THEME.accent(">") : SHELL_THEME.muted(`${index + 1}.`);
    const details = getCandidateDetails(candidate);
    process.stdout.write(
      `  ${prefix} ${SHELL_THEME.command(candidate.path)}${details.length > 0 ? `  ${SHELL_THEME.muted(details.join("  "))}` : ""}\n`
    );
  }
  if (picker.candidates.length > 9) {
    process.stdout.write(`  ${SHELL_THEME.muted(`+${picker.candidates.length - 9} more`)}\n`);
  }
};

export const printRepoIntentPrompt = (
  prompt: RepoIntentPromptState,
  entries: readonly { name: string; summary: string }[]
) => {
  printSectionTitle("next");
  process.stdout.write(
    `  ${SHELL_THEME.muted(`found ${prompt.payload.candidateCount} robots. choose what to do with this repo.`)}\n`
  );
  for (const [index, entry] of entries.entries()) {
    const prefix =
      index === prompt.selectedIndex ? SHELL_THEME.accent(">") : SHELL_THEME.muted(`${index + 1}.`);
    process.stdout.write(
      `  ${prefix} ${SHELL_THEME.command(entry.name)}  ${SHELL_THEME.muted(entry.summary)}\n`
    );
  }
};

export const renderContextValue = (row: ShellContextRow): string => {
  switch (row.tone) {
    case "accent":
      return SHELL_THEME.accent(row.value);
    case "muted":
      return SHELL_THEME.muted(row.value);
    default:
      return SHELL_THEME.command(row.value);
  }
};

export const renderContextRow = (row: ShellContextRow): string =>
  `  ${SHELL_THEME.muted(row.label.padEnd(12))} ${renderContextValue(row)}`;

export const printContextRows = (rows: readonly ShellContextRow[]) => {
  for (const row of rows) {
    process.stdout.write(`${renderContextRow(row)}\n`);
  }
};

export const printCommandList = (
  entries: readonly { name: string; summary: string }[],
  prefix = "/",
  includeSummary = true
) => {
  for (const entry of entries) {
    const label = `${prefix}${entry.name}`;
    if (!includeSummary || !entry.summary) {
      process.stdout.write(`  ${SHELL_THEME.command(label)}\n`);
      continue;
    }

    process.stdout.write(
      `  ${SHELL_THEME.command(label.padEnd(18))} ${SHELL_THEME.muted(entry.summary)}\n`
    );
  }
};

export const printRootQuickStart = () => {
  process.stdout.write(`${SHELL_THEME.brand(SHELL_BRAND)}\n\n`);
  process.stdout.write(`${SHELL_THEME.muted(ROOT_GUIDANCE)}\n`);
};

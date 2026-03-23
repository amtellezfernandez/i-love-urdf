import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import * as process from "node:process";
import AdmZip = require("adm-zip");
import { CLI_HELP_SECTIONS, type SupportedCommandName } from "./commandCatalog";
import {
  COMMAND_COMPLETION_SPEC_BY_NAME,
  type CompletionCommandSpec,
  type CompletionOptionSpec,
} from "./cliCompletion";
import { runUpdateCommand } from "./cliUpdate";
import { readGitHubCliToken } from "../node/githubCliAuth";
import { parseGitHubRepositoryReference } from "../repository/githubRepositoryInspection";
import type { LoadSourceResult } from "../sources/loadSourceNode";

type ShellOptions = {
  initialSlashCommand?: string;
};

type PendingValuePrompt = {
  key: string;
  slashName: string;
  title: string;
  examples: readonly string[];
  notes: readonly string[];
  expectsPath: boolean;
};

type ShellSession = {
  command: SupportedCommandName;
  label: string;
  spec: CompletionCommandSpec;
  args: Map<string, string | boolean>;
  inheritedKeys: Set<string>;
  pending: PendingValuePrompt | null;
};

type LoadedSourceContext = {
  source: "local-file" | "local-repo" | "github";
  urdfPath: string;
  localPath?: string;
  githubRef?: string;
  repositoryUrdfPath?: string;
};

type ShellState = {
  session: ShellSession | null;
  rootTask: RootTaskName | null;
  candidatePicker: CandidatePickerState | null;
  xacroRetry: ((pythonExecutable?: string) => AutoAutomationResult) | null;
  loadedSource: LoadedSourceContext | null;
  lastUrdfPath?: string;
};

type ShellFeedbackKind = "info" | "success" | "warning" | "error";

type ShellFeedback = {
  kind: ShellFeedbackKind;
  text: string;
};

type ShellTimelineEntry = {
  role: "user" | "assistant";
  lines: readonly string[];
  kind: Exclude<ShellFeedbackKind, "warning"> | "warning";
};

type ShellContextRowTone = "command" | "muted" | "accent";

type ShellContextRow = {
  label: string;
  value: string;
  tone?: ShellContextRowTone;
};

type ShellOutputPanel = {
  title: string;
  lines: readonly string[];
  kind: Exclude<ShellFeedbackKind, "warning">;
} | null;

type TtyMenuEntryKind = "task" | "flow" | "option" | "action" | "system";

type TtyMenuEntry = {
  name: string;
  summary: string;
  kind: TtyMenuEntryKind;
};

type TtyShellViewState = {
  input: string;
  timeline: ShellTimelineEntry[];
  menuIndex: number;
  notice: ShellFeedback | null;
  output: ShellOutputPanel;
  busy:
    | {
        title: string;
        lines: readonly string[];
      }
    | null;
};

type Keypress = {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  name?: string;
  sequence?: string;
};

type RootTaskName = "open" | "inspect" | "check" | "convert" | "fix";

type RootTaskDefinition = {
  name: RootTaskName;
  summary: string;
};

type RootTaskActionDefinition = {
  name: string;
  summary: string;
  command: SupportedCommandName;
  sessionLabel: string;
  openPending?: {
    key: string;
    slashName: string;
    onlyIfMissing?: boolean;
  };
};

type RootShellCommandDefinition = {
  name: string;
  summary: string;
  command: SupportedCommandName;
  sessionLabel: string;
  openPending?: RootTaskActionDefinition["openPending"];
};

type LocalPathDrop = {
  inputPath: string;
  absolutePath: string;
  isDirectory: boolean;
  isUrdfFile: boolean;
  isXacroFile: boolean;
  isZipFile: boolean;
};

type FreeformSessionTarget = {
  key: string;
  slashName: string;
  value: string;
};

type FreeformRootPlan = {
  rootTask: RootTaskName;
  command: SupportedCommandName;
  label: string;
  key: string;
  slashName: string;
  value: string;
};

type AppliedFreeformInput = {
  session: ShellSession;
  key: string;
};

type AutoPreviewPanel = {
  title: string;
  lines: readonly string[];
  kind: Exclude<ShellFeedbackKind, "warning">;
} | null;

type AutoAutomationResult = {
  panel: AutoPreviewPanel;
  notice: ShellFeedback | null;
  clearSession: boolean;
};

type RepositoryPreviewCandidate = {
  path: string;
  inspectionMode?: "urdf" | "xacro-source";
  unresolvedMeshReferenceCount?: number;
  xacroArgs?: Array<{ name: string }>;
};

type RepositoryPreviewPayload = {
  owner?: string;
  repo?: string;
  repositoryUrl?: string;
  inspectedPath?: string;
  candidateCount: number;
  primaryCandidatePath: string | null;
  candidates: RepositoryPreviewCandidate[];
};

type CandidatePickerState = {
  candidates: RepositoryPreviewCandidate[];
  selectedIndex: number;
  loadArgs: Map<string, string | boolean>;
  extractedArchivePath?: string;
};

type ShellBangCommandName = "xacro";

type ShellBangCommandResult = {
  panel: AutoPreviewPanel;
  notice: ShellFeedback;
  clearSession?: boolean;
};

type SessionOptionPriority = "required" | "common" | "advanced";

type SessionOptionEntry = {
  key: string;
  name: string;
  summary: string;
  priority: SessionOptionPriority;
};

type ShellTheme = {
  enabled: boolean;
  brand: (text: string) => string;
  command: (text: string) => string;
  icon: (text: string) => string;
  muted: (text: string) => string;
  section: (text: string) => string;
  success: (text: string) => string;
  accent: (text: string) => string;
  warning: (text: string) => string;
  error: (text: string) => string;
  selected: (text: string) => string;
};

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  reverse: "\u001b[7m",
  gray: "\u001b[90m",
  magenta: "\u001b[35m",
  brightMagenta: "\u001b[95m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
} as const;

const paint = (enabled: boolean, text: string, ...codes: readonly string[]): string => {
  if (!enabled || text.length === 0) {
    return text;
  }

  return `${codes.join("")}${text}${ANSI.reset}`;
};

const resolveColorSupport = (): boolean => {
  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined) {
    return forceColor !== "0";
  }
  if ("NO_COLOR" in process.env) {
    return false;
  }
  if (process.env.TERM === "dumb") {
    return false;
  }
  return Boolean(process.stdout?.isTTY);
};

const createTheme = (enabled: boolean): ShellTheme => ({
  enabled,
  brand: (text) => paint(enabled, text, ANSI.bold, ANSI.brightMagenta),
  command: (text) => paint(enabled, text, ANSI.bold, ANSI.magenta),
  icon: (text) => paint(enabled, text, ANSI.gray),
  muted: (text) => paint(enabled, text, ANSI.dim),
  section: (text) => paint(enabled, text, ANSI.dim, ANSI.magenta),
  success: (text) => paint(enabled, text, ANSI.bold, ANSI.green),
  accent: (text) => paint(enabled, text, ANSI.bold, ANSI.brightMagenta),
  warning: (text) => paint(enabled, text, ANSI.bold, ANSI.yellow),
  error: (text) => paint(enabled, text, ANSI.bold, ANSI.red),
  selected: (text) => paint(enabled, text, ANSI.bold, ANSI.reverse, ANSI.brightMagenta),
});

const SHELL_THEME = createTheme(resolveColorSupport());
const SHELL_BRAND = "i<3urdf";
const XACRO_RUNTIME_NOTICE = "xacro runtime not set. run !xacro, then retry";

const SHELL_BUILTIN_COMMANDS = [
  { name: "help", summary: "Show slash commands for the current context." },
  { name: "update", summary: "Install the latest ilu release." },
  { name: "clear", summary: "Clear the terminal." },
  { name: "last", summary: "Show the last remembered URDF path." },
];

const HIDDEN_SHELL_COMMAND_NAMES = ["exit", "quit"] as const;

const SESSION_BUILTIN_COMMANDS = [
  { name: "show", summary: "Show the current command, values, and next step." },
  { name: "run", summary: "Run the current command." },
  { name: "update", summary: "Install the latest ilu release." },
  { name: "reset", summary: "Clear the current command state." },
  { name: "back", summary: "Return to the root slash-command menu." },
];

const ROOT_TASKS = [
  { name: "open", summary: "Open a repo, folder, or file as a working URDF." },
  { name: "inspect", summary: "Preview a repo or URDF before deciding what to do next." },
  { name: "check", summary: "Run health, validation, and orientation checks." },
  { name: "convert", summary: "Convert XACRO and URDF files into other formats." },
  { name: "fix", summary: "Repair mesh paths, mesh refs, and basic URDF issues." },
] as const satisfies readonly RootTaskDefinition[];

const ROOT_SHELL_COMMANDS = [
  {
    name: "open",
    summary: "Load a repo, folder, or file as the current source.",
    command: "load-source",
    sessionLabel: "open",
  },
  {
    name: "inspect",
    summary: "Preview a repo or folder and suggest the best entrypoint.",
    command: "inspect-repo",
    sessionLabel: "inspect",
  },
  {
    name: "analyze",
    summary: "Inspect structure, morphology, and mesh references.",
    command: "analyze",
    sessionLabel: "analyze",
    openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
  },
  {
    name: "health",
    summary: "Check structure, axes, and orientation risks.",
    command: "health-check",
    sessionLabel: "health",
    openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
  },
  {
    name: "validate",
    summary: "Check whether the current URDF is structurally valid.",
    command: "validate",
    sessionLabel: "validate",
    openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
  },
  {
    name: "orientation",
    summary: "Guess the likely up-axis and forward axis.",
    command: "guess-orientation",
    sessionLabel: "orientation",
    openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
  },
] as const satisfies readonly RootShellCommandDefinition[];

const ROOT_START_COMMAND_NAMES = ["open", "inspect", "analyze", "health", "validate", "orientation"] as const;
const ROOT_READY_COMMAND_NAMES = ["analyze", "health", "validate", "orientation", "open", "inspect"] as const;
const FLAT_ROOT_SESSION_LABELS = new Set<string>(ROOT_SHELL_COMMANDS.map((entry) => entry.sessionLabel));

const ROOT_TASK_ACTIONS = {
  open: [
    {
      name: "repo",
      summary: "Open from GitHub and assemble a working URDF.",
      command: "load-source",
      sessionLabel: "open",
      openPending: { key: "github", slashName: "repo" },
    },
    {
      name: "local",
      summary: "Open from a local repo or directory.",
      command: "load-source",
      sessionLabel: "open",
      openPending: { key: "path", slashName: "local" },
    },
    {
      name: "file",
      summary: "Open a local URDF file directly.",
      command: "load-source",
      sessionLabel: "open",
      openPending: { key: "path", slashName: "file" },
    },
  ],
  inspect: [
    {
      name: "repo",
      summary: "Preview a GitHub repo and suggest the right entrypoint.",
      command: "inspect-repo",
      sessionLabel: "inspect",
      openPending: { key: "github", slashName: "repo" },
    },
    {
      name: "local",
      summary: "Preview a local repo and suggest the right entrypoint.",
      command: "inspect-repo",
      sessionLabel: "inspect",
      openPending: { key: "local", slashName: "local" },
    },
    {
      name: "file",
      summary: "Inspect a prepared URDF file.",
      command: "analyze",
      sessionLabel: "inspect",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
  ],
  check: [
    {
      name: "health",
      summary: "Run the main URDF health check.",
      command: "health-check",
      sessionLabel: "check",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
    {
      name: "validate",
      summary: "Validate URDF structure and required tags.",
      command: "validate",
      sessionLabel: "check",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
    {
      name: "orientation",
      summary: "Guess the likely up-axis and forward axis.",
      command: "guess-orientation",
      sessionLabel: "check",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
  ],
  convert: [
    {
      name: "xacro",
      summary: "Expand a XACRO file, repo, or GitHub source into URDF.",
      command: "xacro-to-urdf",
      sessionLabel: "convert",
      openPending: { key: "xacro", slashName: "xacro" },
    },
    {
      name: "mjcf",
      summary: "Convert a URDF file into MJCF.",
      command: "urdf-to-mjcf",
      sessionLabel: "convert",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
    {
      name: "usd",
      summary: "Convert a URDF file into initial USD output.",
      command: "urdf-to-usd",
      sessionLabel: "convert",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
  ],
  fix: [
    {
      name: "mesh-paths",
      summary: "Repair package:// and relative mesh paths in a URDF file.",
      command: "fix-mesh-paths",
      sessionLabel: "fix",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
    {
      name: "mesh-refs",
      summary: "Repair missing mesh references in a repo-based source.",
      command: "repair-mesh-refs",
      sessionLabel: "fix",
    },
    {
      name: "axes",
      summary: "Normalize non-unit or awkward joint axes in a URDF file.",
      command: "normalize-axes",
      sessionLabel: "fix",
      openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
    },
  ],
} as const satisfies Record<RootTaskName, readonly RootTaskActionDefinition[]>;

const COMMAND_SUMMARY_OVERRIDES: Partial<Record<SupportedCommandName, string>> = {
  "load-source": "Load from GitHub, a local repo, or a local file.",
  "inspect-repo": "Preview a local or GitHub repo and suggest the right URDF or XACRO entrypoint.",
  "xacro-to-urdf": "Expand a XACRO file, repo, or GitHub source into URDF.",
  "repair-mesh-refs": "Repair broken mesh references in a local or GitHub repo.",
  "health-check": "Check structure, axes, and orientation risks.",
  analyze: "Inspect structure, morphology, and mesh references.",
  validate: "Check whether the current URDF is structurally valid.",
  "guess-orientation": "Guess the likely up-axis and forward axis.",
};

const URDF_OUTPUT_COMMANDS = new Set<SupportedCommandName>([
  "load-source",
  "xacro-to-urdf",
  "repair-mesh-refs",
  "canonical-order",
  "pretty-print",
  "normalize-axes",
  "snap-axes",
  "fix-mesh-paths",
  "mesh-to-assets",
  "set-joint-axis",
  "set-joint-type",
  "set-joint-limits",
  "set-joint-velocity",
  "rotate-90",
  "apply-orientation",
  "remove-joints",
  "reassign-joint",
  "set-material-color",
  "rename-joint",
  "rename-link",
  "canonicalize-joint-frame",
  "normalize-robot",
]);

const ADVANCED_OPTION_KEYS = new Set([
  "args",
  "concurrency",
  "limits",
  "max-candidates",
  "max-faces",
  "meshes",
  "python",
  "ref",
  "root",
  "subdir",
  "token",
  "venv",
  "wheel",
]);

const SESSION_OPTION_ORDER = {
  "load-source": ["github", "path", "entry", "out", "ref", "subdir", "args", "python", "wheel", "token", "root"],
  "inspect-repo": ["github", "local", "path", "ref", "max-candidates", "token", "out"],
  "repair-mesh-refs": ["github", "local", "urdf", "path", "ref", "token", "out"],
  "xacro-to-urdf": ["xacro", "github", "local", "entry", "out", "args", "ref", "path", "python", "wheel", "token", "root"],
  "health-check": ["urdf", "strict"],
  validate: ["urdf"],
  analyze: ["urdf"],
  diff: ["left", "right"],
} as const satisfies Partial<Record<SupportedCommandName, readonly string[]>>;

const MUTUALLY_EXCLUSIVE_OPTION_GROUPS: Partial<Record<SupportedCommandName, readonly (readonly string[])[]>> = {
  "load-source": [["path", "github"]],
  "inspect-repo": [["local", "github"]],
  "repair-mesh-refs": [["local", "github"]],
  "xacro-to-urdf": [["local", "github"]],
  "urdf-to-usd": [["urdf", "path"]],
};

const SESSION_SLASH_ALIASES: Partial<Record<SupportedCommandName, Readonly<Record<string, string>>>> = {
  "load-source": {
    repo: "github",
    local: "path",
  },
  "inspect-repo": {
    repo: "github",
    local: "local",
    subdir: "path",
  },
  "repair-mesh-refs": {
    repo: "github",
    local: "local",
    subdir: "path",
  },
  "xacro-to-urdf": {
    repo: "github",
    local: "local",
  },
};

const CLI_ENTRY_PATH = path.resolve(__dirname, "..", "cli.js");
const ROOT_GUIDANCE =
  "paste owner/repo or drop a local folder/file. type / for actions, !xacro for xacro setup, /update for latest, ctrl+c to quit";
let cachedGitHubAuthState: boolean | undefined;

const formatShellPrompt = (_state: ShellState): string => "/> ";

const quoteForPreview = (value: string): string => (/\s/.test(value) ? JSON.stringify(value) : value);

const buildCommandPreview = (command: string, args: Map<string, string | boolean>): string => {
  const serializedArgs = Array.from(args.entries()).flatMap(([key, value]) => {
    if (value === false || value === undefined || value === null) {
      return [];
    }

    if (value === true) {
      return [`--${key}`];
    }

    return [`--${key}`, quoteForPreview(String(value))];
  });

  return `ilu ${[command, ...serializedArgs].join(" ")}`.trim();
};

const pushFeedback = (
  feedback: ShellFeedback[] | undefined,
  kind: ShellFeedbackKind,
  text: string
) => {
  feedback?.push({ kind, text });
};

const writeFeedback = (entry: ShellFeedback) => {
  const stream = entry.kind === "error" ? process.stderr : process.stdout;
  const render =
    entry.kind === "success"
      ? SHELL_THEME.success
      : entry.kind === "warning"
        ? SHELL_THEME.warning
        : entry.kind === "error"
          ? SHELL_THEME.error
          : SHELL_THEME.muted;
  stream.write(`${render(entry.text)}\n`);
};

const flushFeedback = (feedback: readonly ShellFeedback[]) => {
  for (const entry of feedback) {
    writeFeedback(entry);
  }
};

const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const formatInlineValue = (value: string): string => (value.length > 0 ? ` ${quoteForPreview(value)}` : "");

const createOutputPanel = (
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

const getPanelLineIcon = (line: string): string => {
  const normalized = stripAnsi(line).trim().toLowerCase();
  if (
    normalized === "looks ready" ||
    normalized === "no obvious problems found" ||
    normalized.startsWith("validation passed") ||
    normalized.startsWith("health check passed")
  ) {
    return "✓";
  }

  if (
    normalized.startsWith("best next step") ||
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

const renderPanelLine = (
  line: string,
  kind: Exclude<ShellFeedbackKind, "warning">
): string => {
  const renderText = kind === "error" ? SHELL_THEME.error : SHELL_THEME.muted;
  return `${SHELL_THEME.icon(getPanelLineIcon(line))} ${renderText(line)}`;
};

const printOutputPanel = (panel: AutoPreviewPanel | ShellOutputPanel) => {
  if (!panel) {
    return;
  }

  printSectionTitle(panel.title);
  for (const line of panel.lines) {
    process.stdout.write(`  ${renderPanelLine(line, panel.kind)}\n`);
  }
};

const clearCandidatePicker = (state: ShellState) => {
  state.candidatePicker = null;
};

const clearXacroRetry = (state: ShellState) => {
  state.xacroRetry = null;
};

const getCandidateDetails = (candidate: RepositoryPreviewCandidate): string[] => {
  const details = [candidate.inspectionMode === "xacro-source" ? "xacro" : "urdf"];
  if ((candidate.unresolvedMeshReferenceCount ?? 0) > 0) {
    details.push(`${candidate.unresolvedMeshReferenceCount} missing mesh refs`);
  }
  if ((candidate.xacroArgs?.length ?? 0) > 0) {
    details.push(`${candidate.xacroArgs.length} xacro args`);
  }
  return details;
};

const printCandidatePicker = (picker: CandidatePickerState) => {
  printSectionTitle("choose");
  process.stdout.write(`  ${SHELL_THEME.muted("type a number, press Enter for the highlighted match, or paste a repo entry path")}\n`);
  for (const [index, candidate] of picker.candidates.slice(0, 9).entries()) {
    const prefix = index === picker.selectedIndex ? SHELL_THEME.accent(">") : SHELL_THEME.muted(`${index + 1}.`);
    const details = getCandidateDetails(candidate);
    process.stdout.write(
      `  ${prefix} ${SHELL_THEME.command(candidate.path)}${details.length > 0 ? `  ${SHELL_THEME.muted(details.join("  "))}` : ""}\n`
    );
  }
  if (picker.candidates.length > 9) {
    process.stdout.write(`  ${SHELL_THEME.muted(`+${picker.candidates.length - 9} more`) }\n`);
  }
};

const hasGitHubAuthConfigured = (): boolean => {
  if (cachedGitHubAuthState !== undefined) {
    return cachedGitHubAuthState;
  }

  const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  cachedGitHubAuthState = Boolean(envToken || readGitHubCliToken());
  return cachedGitHubAuthState;
};

const printSectionTitle = (title: string) => {
  process.stdout.write(`\n${SHELL_THEME.section(title)}\n`);
};

const renderContextValue = (row: ShellContextRow): string => {
  switch (row.tone) {
    case "accent":
      return SHELL_THEME.accent(row.value);
    case "muted":
      return SHELL_THEME.muted(row.value);
    default:
      return SHELL_THEME.command(row.value);
  }
};

const renderContextRow = (row: ShellContextRow): string =>
  `  ${SHELL_THEME.muted(row.label.padEnd(12))} ${renderContextValue(row)}`;

const printContextRows = (rows: readonly ShellContextRow[]) => {
  for (const row of rows) {
    process.stdout.write(`${renderContextRow(row)}\n`);
  }
};

const printCommandList = (
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

const printRootQuickStart = () => {
  process.stdout.write(`${SHELL_THEME.brand(SHELL_BRAND)}\n`);
  process.stdout.write(`${SHELL_THEME.muted("ilu interactive urdf shell")}\n`);
  process.stdout.write(`${SHELL_THEME.muted(ROOT_GUIDANCE)}\n`);
};

const describeLocalSourceValue = (value: string): string => {
  const localPath = detectLocalPathDrop(value);
  if (localPath?.isDirectory) {
    return `folder ${quoteForPreview(value)}`;
  }
  if (localPath?.isZipFile) {
    return `archive ${quoteForPreview(value)}`;
  }
  if (localPath?.isXacroFile) {
    return `xacro ${quoteForPreview(value)}`;
  }
  return `file ${quoteForPreview(value)}`;
};

const getLoadedSourceContextRows = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">
): readonly ShellContextRow[] => {
  const loadedSource = state.loadedSource;

  if (!loadedSource) {
    if (!state.lastUrdfPath) {
      return [
        { label: "source", value: "none yet", tone: "muted" },
        {
          label: "action",
          value: "load a repo, folder, or file as the current source",
          tone: "muted",
        },
        {
          label: "next",
          value: "paste owner/repo or drop a local folder/file",
          tone: "accent",
        },
      ];
    }

    return [
      { label: "source", value: `remembered ${quoteForPreview(state.lastUrdfPath)}` },
      {
        label: "action",
        value: "keep investigating the remembered URDF or paste another source",
        tone: "muted",
      },
      {
        label: "next",
        value: "/analyze /health /validate /orientation or paste another source",
        tone: "accent",
      },
    ];
  }

  const rows: ShellContextRow[] = [];

  if (loadedSource.source === "github") {
    rows.push({
      label: "source",
      value: `GitHub ${quoteForPreview(loadedSource.githubRef ?? loadedSource.urdfPath)}`,
    });
  } else if (loadedSource.source === "local-repo") {
    rows.push({
      label: "source",
      value: `folder ${quoteForPreview(loadedSource.localPath ?? loadedSource.urdfPath)}`,
    });
  } else {
    rows.push({
      label: "source",
      value: describeLocalSourceValue(loadedSource.localPath ?? loadedSource.urdfPath),
    });
  }

  if (loadedSource.repositoryUrdfPath) {
    rows.push({ label: "entry", value: loadedSource.repositoryUrdfPath });
  }

  if (
    loadedSource.urdfPath &&
    (loadedSource.source !== "local-file" || loadedSource.localPath !== loadedSource.urdfPath)
  ) {
    rows.push({ label: "working urdf", value: quoteForPreview(loadedSource.urdfPath) });
  }

  rows.push({
    label: "action",
    value: "work with the loaded source or paste another one",
    tone: "muted",
  });
  rows.push({
    label: "next",
    value: "/analyze /health /validate /orientation or paste another source",
    tone: "accent",
  });

  return rows;
};

const printRootOptions = (state: Pick<ShellState, "lastUrdfPath" | "loadedSource">) => {
  printSectionTitle("context");
  printContextRows(getLoadedSourceContextRows(state));

  printSectionTitle("actions");
  printCommandList(getReadySourceLabel(state) ? getLoadedRootCommandList() : START_ROOT_MENU_ENTRIES);

  printSectionTitle("system");
  printCommandList(SHELL_BUILTIN_COMMANDS);
};

const printRootTaskOptions = (_task: RootTaskName) => {
  process.stdout.write(`${SHELL_THEME.muted("Direct actions only. Type / for actions or paste a source.\n")}`);
  printRootOptions({
    lastUrdfPath: undefined,
    loadedSource: null,
  });
};

const getSlashAliasesForCommand = (command: SupportedCommandName): Readonly<Record<string, string>> =>
  SESSION_SLASH_ALIASES[command] ?? {};

const getOptionSpecByKey = (
  session: ShellSession,
  key: string
): CompletionOptionSpec | undefined => session.spec.options.find((option) => option.flag === `--${key}`);

const getPreferredSlashName = (session: ShellSession, key: string): string => {
  const alias = Object.entries(getSlashAliasesForCommand(session.command)).find(([, target]) => target === key)?.[0];
  return alias ?? key;
};

const getSlashDisplayName = (session: ShellSession, key: string): string =>
  `/${getPreferredSlashName(session, key)}`;

const getShellCommandSummary = (command: SupportedCommandName): string =>
  COMMAND_SUMMARY_OVERRIDES[command] ?? COMMAND_COMPLETION_SPEC_BY_NAME[command].summary;

const getRootTaskSummary = (task: RootTaskName): string =>
  ROOT_TASKS.find((entry) => entry.name === task)?.summary ?? "Task flow";

const getRootTaskActionDefinitions = (task: RootTaskName): readonly RootTaskActionDefinition[] =>
  ROOT_TASK_ACTIONS[task];

const getRootShellCommandDefinition = (name: string): RootShellCommandDefinition | undefined =>
  ROOT_SHELL_COMMANDS.find((entry) => entry.name === name);

const isFlatRootSession = (session: ShellSession): boolean => FLAT_ROOT_SESSION_LABELS.has(session.label);

const shouldSuppressSessionOptionMenu = (session: ShellSession): boolean =>
  isFlatRootSession(session) && (session.pending !== null || session.args.size === 0);

const getSessionSourceValue = (
  session: ShellSession,
  keys: readonly string[]
): string | null => {
  for (const key of keys) {
    const value = session.args.get(key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
};

const getSessionPurposeText = (session: ShellSession): string => {
  switch (session.label) {
    case "open":
      return "Load a repo, folder, or file as the current source.";
    case "inspect":
      return "Preview a repo or folder and suggest the best entrypoint.";
    case "analyze":
      return "Run the compact investigation view.";
    case "health":
      return "Run validation and the main health check.";
    case "validate":
      return "Check URDF structure and required tags.";
    case "orientation":
      return "Guess the likely up-axis and forward axis.";
    default:
      return getShellCommandSummary(session.command);
  }
};

const getSessionNextText = (session: ShellSession): string => {
  if (session.pending) {
    return `paste ${session.pending.title.toLowerCase()}`;
  }

  if (session.label === "open" && session.args.size === 0) {
    return "paste owner/repo or drop a local folder/file";
  }

  if (session.label === "inspect" && session.args.size === 0) {
    return "paste owner/repo or drop a local folder";
  }

  const requirementStatus = getRequirementStatus(session);
  if (requirementStatus.ready) {
    return "press Enter or type /run";
  }

  return `set ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}`;
};

const getSessionContextRows = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  session: ShellSession
): readonly ShellContextRow[] => {
  const rows: ShellContextRow[] = [];
  const githubSource = getSessionSourceValue(session, ["github"]);
  const localSource = getSessionSourceValue(session, ["local"]);
  const pathSource = getSessionSourceValue(session, ["path"]);
  const xacroSource = getSessionSourceValue(session, ["xacro"]);
  const urdfSource = getSessionSourceValue(session, ["urdf"]);
  const canReuseLoadedSource =
    session.label !== "open" &&
    session.label !== "inspect" &&
    !githubSource &&
    !localSource &&
    !pathSource &&
    !xacroSource &&
    session.inheritedKeys.has("urdf");

  if (githubSource) {
    rows.push({ label: "source", value: `GitHub ${quoteForPreview(githubSource)}` });
  } else if (localSource) {
    rows.push({ label: "source", value: `folder ${quoteForPreview(localSource)}` });
  } else if (pathSource) {
    rows.push({ label: "source", value: describeLocalSourceValue(pathSource) });
  } else if (xacroSource) {
    rows.push({ label: "source", value: `xacro ${quoteForPreview(xacroSource)}` });
  } else if (urdfSource && !canReuseLoadedSource) {
    rows.push({ label: "source", value: describeLocalSourceValue(urdfSource) });
  } else {
    rows.push(...getLoadedSourceContextRows(state).filter((row) => row.label === "source" || row.label === "entry"));
  }

  if (urdfSource) {
    const sourceValue = rows.find((row) => row.label === "source")?.value ?? "";
    const inlineUrdfValue = quoteForPreview(urdfSource);
    if (!sourceValue.includes(inlineUrdfValue)) {
      rows.push({ label: "working urdf", value: inlineUrdfValue });
    }
  }

  rows.push({
    label: "action",
    value: getSessionPurposeText(session).replace(/\.$/, ""),
    tone: "muted",
  });
  rows.push({
    label: "next",
    value: getSessionNextText(session),
    tone: getRequirementStatus(session).ready ? "accent" : "command",
  });

  return rows;
};

const buildSessionNarrativeLines = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  session: ShellSession
): readonly string[] =>
  getSessionContextRows(state, session)
    .filter((row) => row.label === "source" || row.label === "action" || row.label === "next")
    .map((row) => `${row.label} ${row.value}`);

const buildSessionHeadline = (session: ShellSession): string => {
  switch (session.label) {
    case "open": {
      const source = getSessionSourceValue(session, ["github", "path"]);
      return source ? `open ${quoteForPreview(source)}` : "open a repo, folder, or file";
    }
    case "inspect": {
      const source = getSessionSourceValue(session, ["github", "local", "urdf"]);
      return source ? `inspect ${quoteForPreview(source)}` : "inspect a repo or URDF";
    }
    case "check": {
      const source = getSessionSourceValue(session, ["urdf"]);
      return source ? `check ${quoteForPreview(source)}` : "check a URDF";
    }
    case "convert": {
      const source = getSessionSourceValue(session, ["xacro", "urdf", "github", "local"]);
      return source ? `convert ${quoteForPreview(source)}` : "convert a source";
    }
    case "fix": {
      const source = getSessionSourceValue(session, ["urdf", "github", "local"]);
      return source ? `fix ${quoteForPreview(source)}` : "fix a URDF or repo";
    }
    default:
      return getShellCommandSummary(session.command);
  }
};

const findRootTaskAction = (
  task: RootTaskName,
  slashCommand: string
): RootTaskActionDefinition | undefined =>
  getRootTaskActionDefinitions(task).find((entry) => entry.name === slashCommand);

const getOptionOrderRank = (session: ShellSession, key: string): number => {
  const customOrder = SESSION_OPTION_ORDER[session.command] ?? [];
  const customIndex = customOrder.indexOf(key);
  return customIndex === -1 ? Number.MAX_SAFE_INTEGER : customIndex;
};

const getOptionSummary = (
  session: ShellSession,
  key: string,
  option: CompletionOptionSpec
): string => {
  if (key === "github") {
    return "GitHub repo or URL. Accepts owner/repo, github.com/owner/repo, or a full https:// URL.";
  }

  if (key === "path" && session.command === "load-source") {
    return "Local file or local repository path.";
  }

  if (key === "local") {
    return "Local repository path.";
  }

  if (key === "path" && (session.command === "inspect-repo" || session.command === "repair-mesh-refs")) {
    return "Limit GitHub inspection to a repository subdirectory.";
  }

  if (key === "entry") {
    return "Path to the URDF or XACRO entrypoint inside the repo.";
  }

  if (key === "urdf") {
    return "URDF file path.";
  }

  if (key === "xacro") {
    return "XACRO file path.";
  }

  if (key === "out") {
    return "Write the output to a file.";
  }

  if (key === "root") {
    return "Working directory for extracted files.";
  }

  if (key === "args") {
    return "XACRO args like prefix=demo,use_mock_hardware=true.";
  }

  if (key === "ref") {
    return "Git branch, tag, or ref.";
  }

  if (key === "subdir") {
    return "Limit repository scanning to a subdirectory.";
  }

  if (key === "token") {
    return "GitHub token override.";
  }

  if (key === "python") {
    return "Python executable path.";
  }

  if (key === "wheel") {
    return "Path to a xacro wheel.";
  }

  if (key === "left") {
    return "Left URDF path.";
  }

  if (key === "right") {
    return "Right URDF path.";
  }

  if (key === "strict") {
    return "Treat warnings as failures.";
  }

  if (key === "mesh-dir") {
    return "Directory that contains mesh files.";
  }

  if (key === "out-dir") {
    return "Write converted meshes to a new directory.";
  }

  if (!option.valueHint) {
    return `Toggle ${option.flag}.`;
  }

  return `Set ${option.flag} (${option.valueHint}).`;
};

const getRequiredKeys = (session: ShellSession): Set<string> =>
  new Set(session.spec.requiredAlternatives.flat());

const getSatisfiedRequiredKeyCount = (
  session: ShellSession,
  alternative: readonly string[]
): number => alternative.filter((key) => session.args.has(key)).length;

const hasStartedRequiredWorkflow = (session: ShellSession): boolean =>
  session.spec.requiredAlternatives.some((alternative) => getSatisfiedRequiredKeyCount(session, alternative) > 0);

const getStarterSteps = (session: ShellSession): readonly (readonly string[])[] => {
  const startersBySignature = new Map<string, readonly string[]>();

  for (const alternative of session.spec.requiredAlternatives) {
    const orderedAlternative = [...alternative].sort(
      (left, right) => getOptionOrderRank(session, left) - getOptionOrderRank(session, right)
    );
    const starter = orderedAlternative[0];
    if (!starter) {
      continue;
    }

    startersBySignature.set(starter, [starter]);
  }

  return Array.from(startersBySignature.values()).sort((left, right) => {
    const leftRank = getOptionOrderRank(session, left[0] ?? "");
    const rightRank = getOptionOrderRank(session, right[0] ?? "");
    return leftRank - rightRank;
  });
};

const getOptionPriority = (session: ShellSession, key: string): SessionOptionPriority => {
  const highlightedKeys = new Set(
    (session.spec.requiredAlternatives.length > 1 && !hasStartedRequiredWorkflow(session)
      ? getStarterSteps(session)
      : getRequirementStatus(session).nextSteps
    ).flat()
  );
  if (highlightedKeys.has(key) || (highlightedKeys.size === 0 && getRequiredKeys(session).has(key))) {
    return "required";
  }

  if (ADVANCED_OPTION_KEYS.has(key)) {
    return "advanced";
  }

  return "common";
};

const getSessionOptionEntries = (session: ShellSession): readonly SessionOptionEntry[] => {
  const appearanceOrder = new Map(
    session.spec.options.map((option, index) => [option.flag.slice(2), index] as const)
  );

  return session.spec.options
    .map((option) => {
      const key = option.flag.slice(2);
      return {
        key,
        name: getPreferredSlashName(session, key),
        summary: getOptionSummary(session, key, option),
        priority: getOptionPriority(session, key),
      };
    })
    .sort((left, right) => {
      const normalizedLeftIndex = getOptionOrderRank(session, left.key);
      const normalizedRightIndex = getOptionOrderRank(session, right.key);

      if (normalizedLeftIndex !== normalizedRightIndex) {
        return normalizedLeftIndex - normalizedRightIndex;
      }

      return (appearanceOrder.get(left.key) ?? 0) - (appearanceOrder.get(right.key) ?? 0);
    });
};

const shouldHideVisibleSessionOption = (session: ShellSession, key: string): boolean => {
  if (session.inheritedKeys.has(key) && SOURCE_OPTION_KEYS.has(key)) {
    return true;
  }

  if (session.command === "inspect-repo" || session.command === "repair-mesh-refs") {
    if (session.args.has("local")) {
      return key === "github" || key === "path" || key === "ref" || key === "token";
    }
    if (session.args.has("github")) {
      return key === "local";
    }
  }

  return false;
};

const getVisibleSessionOptionEntries = (session: ShellSession): readonly SessionOptionEntry[] =>
  getSessionOptionEntries(session).filter((entry) => !shouldHideVisibleSessionOption(session, entry.key));

const formatSlashSequence = (session: ShellSession, keys: readonly string[]): string =>
  keys.map((key) => getSlashDisplayName(session, key)).join(" + ");

const formatStatusTag = (label: "next" | "ready" | "flow" | "cmd"): string => {
  switch (label) {
    case "next":
      return SHELL_THEME.accent(`[${label}]`);
    case "ready":
      return SHELL_THEME.success(`[${label}]`);
    case "flow":
      return SHELL_THEME.muted(label);
    case "cmd":
      return SHELL_THEME.muted(label);
  }
};

const getRequirementStatus = (
  session: ShellSession
): {
  ready: boolean;
  nextSteps: readonly (readonly string[])[];
} => {
  if (session.spec.requiredAlternatives.length === 0) {
    return { ready: true, nextSteps: [] };
  }

  if (session.spec.requiredAlternatives.length > 1 && !hasStartedRequiredWorkflow(session)) {
    return {
      ready: false,
      nextSteps: getStarterSteps(session),
    };
  }

  let bestSatisfiedCount = -1;
  let bestMissingCount = Number.MAX_SAFE_INTEGER;
  const nextStepsBySignature = new Map<string, readonly string[]>();

  for (const alternative of session.spec.requiredAlternatives) {
    const missing = [...alternative.filter((key) => !session.args.has(key))].sort(
      (left, right) => getOptionOrderRank(session, left) - getOptionOrderRank(session, right)
    );
    if (missing.length === 0) {
      return { ready: true, nextSteps: [] };
    }

    const satisfiedCount = alternative.length - missing.length;
    if (
      satisfiedCount > bestSatisfiedCount ||
      (satisfiedCount === bestSatisfiedCount && missing.length < bestMissingCount)
    ) {
      bestSatisfiedCount = satisfiedCount;
      bestMissingCount = missing.length;
      nextStepsBySignature.clear();
      nextStepsBySignature.set(missing.join("\u0000"), missing);
      continue;
    }

    if (satisfiedCount === bestSatisfiedCount && missing.length === bestMissingCount) {
      nextStepsBySignature.set(missing.join("\u0000"), missing);
    }
  }

  return {
    ready: false,
    nextSteps: Array.from(nextStepsBySignature.values()).sort((left, right) => {
      const leftRank = getOptionOrderRank(session, left[0] ?? "");
      const rightRank = getOptionOrderRank(session, right[0] ?? "");
      return leftRank - rightRank;
    }),
  };
};

const printSessionStatus = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  session: ShellSession
) => {
  printSectionTitle("context");
  printContextRows(getSessionContextRows(state, session));
};

const printSessionPreview = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  session: ShellSession
) => {
  printSectionTitle("context");
  printContextRows(getSessionContextRows(state, session));

  printSectionTitle("command");
  process.stdout.write(`  ${SHELL_THEME.command(buildCommandPreview(session.command, session.args))}\n`);

  if (session.args.size > 0) {
    printSectionTitle("values");
    for (const [key, value] of session.args.entries()) {
      const renderedValue = value === true ? "enabled" : quoteForPreview(String(value));
      process.stdout.write(
        `  ${SHELL_THEME.command(getSlashDisplayName(session, key).padEnd(18))} ${renderedValue}\n`
      );
    }
  }

  printSectionTitle("next");
  process.stdout.write(`  ${renderContextValue(getSessionContextRows(state, session).find((row) => row.label === "next") ?? { label: "next", value: getSessionNextText(session) })}\n`);
};

const printSessionOptions = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  session: ShellSession
) => {
  if (shouldSuppressSessionOptionMenu(session)) {
    printSectionTitle(`/${session.label}`);
    process.stdout.write(`  ${SHELL_THEME.muted(getShellCommandSummary(session.command))}\n`);
    printSessionStatus(state, session);
    printSectionTitle("actions");
    printCommandList(SESSION_BUILTIN_COMMANDS);
    if (session.pending) {
      printPendingValuePrompt(session.pending);
    }
    return;
  }

  const entries = getVisibleSessionOptionEntries(session);
  const requiredEntries = entries.filter((entry) => entry.priority === "required");
  const commonEntries = entries.filter((entry) => entry.priority === "common");
  const advancedEntries = entries.filter((entry) => entry.priority === "advanced");

  printSectionTitle(`/${session.label}`);
  process.stdout.write(`  ${SHELL_THEME.muted(getShellCommandSummary(session.command))}\n`);
  printSessionStatus(state, session);

  if (requiredEntries.length > 0) {
    printSectionTitle("start");
    printCommandList(requiredEntries);
  }

  if (commonEntries.length > 0) {
    printSectionTitle("more");
    printCommandList(commonEntries);
  }

  if (advancedEntries.length > 0) {
    printSectionTitle("advanced");
    printCommandList(advancedEntries);
  }

  printSectionTitle("actions");
  printCommandList(SESSION_BUILTIN_COMMANDS);
};

const parseSlashInput = (
  input: string
): {
  slashCommand: string;
  inlineValue: string;
} | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const withoutSlash = trimmed.slice(1);
  if (!withoutSlash) {
    return { slashCommand: "", inlineValue: "" };
  }

  const firstSpaceIndex = withoutSlash.indexOf(" ");
  if (firstSpaceIndex === -1) {
    return { slashCommand: withoutSlash, inlineValue: "" };
  }

  return {
    slashCommand: withoutSlash.slice(0, firstSpaceIndex).trim(),
    inlineValue: withoutSlash.slice(firstSpaceIndex + 1).trim(),
  };
};

const clearMutuallyExclusiveArgs = (session: ShellSession, key: string) => {
  const groups = MUTUALLY_EXCLUSIVE_OPTION_GROUPS[session.command] ?? [];
  for (const group of groups) {
    if (!group.includes(key)) {
      continue;
    }

    for (const sibling of group) {
      if (sibling !== key) {
        session.args.delete(sibling);
        session.inheritedKeys.delete(sibling);
      }
    }
  }
};

const decodeShellEscapes = (value: string): string => {
  let decoded = "";
  let escaping = false;

  for (const character of value) {
    if (escaping) {
      decoded += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    decoded += character;
  }

  return escaping ? `${decoded}\\` : decoded;
};

const stripMatchingQuotes = (value: string): string => {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }

  return value;
};

const normalizeShellInput = (rawValue: string): string => decodeShellEscapes(stripMatchingQuotes(rawValue.trim()));

const parseBangInput = (input: string): ShellBangCommandName | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith("!")) {
    return null;
  }

  const command = trimmed.slice(1).trim().toLowerCase();
  if (command === "xacro") {
    return "xacro";
  }

  return null;
};

const normalizeFilesystemInput = (rawValue: string): string => {
  const normalized = normalizeShellInput(rawValue);
  if (normalized.startsWith("~")) {
    return path.join(process.env.HOME ?? "", normalized.slice(1));
  }
  return normalized;
};

const looksLikeFilesystemSeed = (rawValue: string): boolean => {
  const normalized = normalizeFilesystemInput(rawValue);
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    normalized.startsWith("~/") ||
    normalized.includes(path.sep)
  );
};

const detectLocalPathDrop = (rawValue: string): LocalPathDrop | null => {
  const inputPath = normalizeFilesystemInput(rawValue);
  if (!inputPath) {
    return null;
  }

  const absolutePath = path.resolve(inputPath);
  try {
    const stats = fs.statSync(absolutePath);
    const lowerPath = absolutePath.toLowerCase();
    return {
      inputPath,
      absolutePath,
      isDirectory: stats.isDirectory(),
      isUrdfFile: stats.isFile() && lowerPath.endsWith(".urdf"),
      isXacroFile: stats.isFile() && (lowerPath.endsWith(".xacro") || lowerPath.endsWith(".urdf.xacro")),
      isZipFile: stats.isFile() && lowerPath.endsWith(".zip"),
    };
  } catch {
    return null;
  }
};

const detectGitHubReferenceInput = (rawValue: string): string | null => {
  const normalized = normalizeShellInput(rawValue);
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    normalized.startsWith("~/") ||
    detectLocalPathDrop(rawValue) ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    return null;
  }

  return parseGitHubRepositoryReference(normalized) ? normalized : null;
};

const isLocalFilesystemKey = (session: ShellSession, key: string): boolean => {
  if (["local", "urdf", "xacro", "left", "right", "out", "root", "python", "wheel"].includes(key)) {
    return true;
  }

  if (key !== "path") {
    return false;
  }

  return session.command === "load-source" || session.command === "urdf-to-usd";
};

const validateOptionValue = (session: ShellSession, key: string, rawValue: string): string | null => {
  const trimmed =
    key === "github"
      ? normalizeShellInput(rawValue)
      : isLocalFilesystemKey(session, key)
        ? normalizeFilesystemInput(rawValue)
        : rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (key === "github") {
    return parseGitHubRepositoryReference(trimmed) ? trimmed : null;
  }

  return trimmed;
};

const getPendingValuePrompt = (
  session: ShellSession,
  key: string,
  slashName: string
): PendingValuePrompt => {
  if (key === "github") {
    return {
      key,
      slashName,
      title: "GitHub repo or URL",
      examples: [
        "ANYbotics/anymal_b_simple_description",
        "github.com/ANYbotics/anymal_b_simple_description",
      ],
      notes: hasGitHubAuthConfigured()
        ? []
        : ["GitHub auth not found. Public repos still work. Run gh auth login for private repos and higher limits."],
      expectsPath: false,
    };
  }

  if (slashName === "local" && session.command === "load-source") {
    return {
      key,
      slashName,
      title: "Local file or repository path",
      examples: ["./robot.urdf", "./robot-description/"],
      notes: [],
      expectsPath: true,
    };
  }

  if (slashName === "local") {
    return {
      key,
      slashName,
      title: "Local repository path",
      examples: ["./robot-description/"],
      notes: [],
      expectsPath: true,
    };
  }

  if (key === "entry") {
    return {
      key,
      slashName,
      title: "Path inside the repository",
      examples: ["urdf/robot.urdf.xacro"],
      notes: [],
      expectsPath: true,
    };
  }

  if (key === "urdf") {
    return {
      key,
      slashName,
      title: "URDF file path",
      examples: ["./robot.urdf"],
      notes: [],
      expectsPath: true,
    };
  }

  if (key === "xacro") {
    return {
      key,
      slashName,
      title: "XACRO file path",
      examples: ["./robot.urdf.xacro"],
      notes: [],
      expectsPath: true,
    };
  }

  if (key === "args") {
    return {
      key,
      slashName,
      title: "XACRO args",
      examples: ["prefix=demo,use_mock_hardware=true"],
      notes: [],
      expectsPath: false,
    };
  }

  if (key === "out") {
    return {
      key,
      slashName,
      title: "Output file path",
      examples: ["./robot.fixed.urdf"],
      notes: [],
      expectsPath: true,
    };
  }

  if (key === "path" && (session.command === "inspect-repo" || session.command === "repair-mesh-refs")) {
    return {
      key,
      slashName,
      title: "Repository subdirectory",
      examples: ["robots/arm"],
      notes: [],
      expectsPath: true,
    };
  }

  if (key === "left" || key === "right") {
    return {
      key,
      slashName,
      title: `${key === "left" ? "Left" : "Right"} URDF path`,
      examples: [`./${key}.urdf`],
      notes: [],
      expectsPath: true,
    };
  }

  const option = getOptionSpecByKey(session, key);
  return {
    key,
    slashName,
    title: option?.valueHint ? `${option.flag} (${option.valueHint})` : option?.flag ?? `--${key}`,
    examples: [],
    notes: [],
    expectsPath: option?.isFilesystemPath === true,
  };
};

const printPendingValuePrompt = (pending: PendingValuePrompt) => {
  process.stdout.write(`\n${SHELL_THEME.section("input")}\n`);
  process.stdout.write(`${SHELL_THEME.command(pending.title)}\n`);
  if (pending.examples.length === 1) {
    process.stdout.write(`${SHELL_THEME.muted(`example: ${pending.examples[0]}`)}\n`);
  } else if (pending.examples.length > 1) {
    process.stdout.write(`${SHELL_THEME.muted("examples:")}\n`);
    for (const example of pending.examples) {
      process.stdout.write(`  ${SHELL_THEME.muted(example)}\n`);
    }
  }

  for (const note of pending.notes) {
    process.stdout.write(`${SHELL_THEME.warning(note)}\n`);
  }
};

const isPathLikeOption = (session: ShellSession, key: string): boolean =>
  getOptionSpecByKey(session, key)?.isFilesystemPath === true;

const setSessionValue = (
  session: ShellSession,
  key: string,
  rawValue: string,
  feedback?: ShellFeedback[]
): boolean => {
  const value = validateOptionValue(session, key, rawValue);
  if (!value) {
    if (key === "github") {
      pushFeedback(feedback, "error", "Expected owner/repo or a GitHub repository URL.");
    } else {
      pushFeedback(feedback, "error", `Invalid value for --${key}.`);
    }
    return false;
  }

  clearMutuallyExclusiveArgs(session, key);
  session.args.set(key, value);
  session.inheritedKeys.delete(key);
  pushFeedback(feedback, "success", `[set] --${key} ${quoteForPreview(value)}`);
  return true;
};

const toggleSessionFlag = (session: ShellSession, key: string, feedback?: ShellFeedback[]) => {
  if (session.args.get(key) === true) {
    session.args.delete(key);
    session.inheritedKeys.delete(key);
    pushFeedback(feedback, "warning", `[unset] --${key}`);
    return;
  }

  session.args.set(key, true);
  session.inheritedKeys.delete(key);
  pushFeedback(feedback, "success", `[on] --${key}`);
};

const getLastUrdfMessage = (state: ShellState): string =>
  state.lastUrdfPath ? `last ${state.lastUrdfPath}` : "no remembered URDF yet";

const printLastUrdf = (state: ShellState) => {
  process.stdout.write(`${SHELL_THEME.muted(getLastUrdfMessage(state))}\n`);
};

const getReadySourceLabel = (state: Pick<ShellState, "loadedSource" | "lastUrdfPath">): string | null =>
  state.loadedSource?.githubRef || state.loadedSource?.localPath || state.loadedSource?.urdfPath || state.lastUrdfPath || null;

const rememberDirectUrdfSource = (state: ShellState, urdfPath: string) => {
  state.loadedSource = {
    source: "local-file",
    urdfPath,
    localPath: urdfPath,
  };
};

const rememberLoadedSource = (
  state: ShellState,
  payload: LoadSourceResult & { outPath: string | null },
  options: {
    githubRef?: string;
  } = {}
) => {
  const normalizedGitHubRef =
    typeof options.githubRef === "string" && options.githubRef.trim().length > 0
      ? options.githubRef.trim()
      : payload.repositoryUrl;

  if (payload.source === "github") {
    state.loadedSource = {
      source: "github",
      urdfPath: payload.outPath || state.lastUrdfPath || "",
      githubRef: normalizedGitHubRef,
      repositoryUrdfPath: payload.entryPath,
    };
    return;
  }

  if (payload.source === "local-repo") {
    const localPath = payload.inspectedPath;
    const originalUrdfPath =
      payload.entryFormat === "urdf" ? path.join(localPath, payload.entryPath) : payload.outPath || state.lastUrdfPath || "";
    state.loadedSource = {
      source: "local-repo",
      urdfPath: originalUrdfPath,
      localPath,
      repositoryUrdfPath: payload.entryPath,
    };
    return;
  }

  state.loadedSource = {
    source: "local-file",
    urdfPath: payload.entryFormat === "urdf" ? payload.inspectedPath : payload.outPath || state.lastUrdfPath || "",
    localPath: payload.inspectedPath,
  };
};

const updateRememberedUrdfPath = (state: ShellState, session: ShellSession) => {
  const directUrdfPath = session.args.get("urdf");
  if (typeof directUrdfPath === "string" && directUrdfPath.trim().length > 0) {
    state.lastUrdfPath = directUrdfPath;
    if (session.command !== "load-source") {
      rememberDirectUrdfSource(state, directUrdfPath);
    }
    return;
  }

  const outPath = session.args.get("out");
  if (typeof outPath === "string" && URDF_OUTPUT_COMMANDS.has(session.command)) {
    state.lastUrdfPath = outPath;
    rememberDirectUrdfSource(state, outPath);
  }
};

const getFollowUpSuggestionMessage = (
  state: ShellState,
  command: SupportedCommandName
): string | null => {
  if ((command === "load-source" || command === "xacro-to-urdf") && state.lastUrdfPath) {
    return `[next] /analyze /health /validate /orientation\nusing ${state.lastUrdfPath}`;
  }

  if (command === "inspect-repo") {
    return "[next] /open or paste another source";
  }

  if (state.lastUrdfPath) {
    return `remembered ${state.lastUrdfPath}`;
  }
  return null;
};

const printFollowUpSuggestions = (state: ShellState, command: SupportedCommandName) => {
  const message = getFollowUpSuggestionMessage(state, command);
  if (!message) {
    return;
  }

  for (const line of message.split("\n")) {
    if (line.startsWith("[next]")) {
      process.stdout.write(`${SHELL_THEME.accent(line)}\n`);
    } else {
      process.stdout.write(`${SHELL_THEME.muted(line)}\n`);
    }
  }
};

const executeCliCommand = (
  command: SupportedCommandName,
  args: Map<string, string | boolean>
): {
  preview: string;
  stdout: string;
  stderr: string;
  status: number;
} => {
  const preview = buildCommandPreview(command, args);
  const argv = [CLI_ENTRY_PATH, command];

  for (const [key, value] of args.entries()) {
    if (value === true) {
      argv.push(`--${key}`);
      continue;
    }

    argv.push(`--${key}`, String(value));
  }

  const result = spawnSync(process.execPath, argv, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    preview,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
};

const parseExecutionJson = <T>(execution: {
  status: number;
  stdout: string;
}): T | null => {
  if (execution.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(execution.stdout) as T;
  } catch {
    return null;
  }
};

const summarizeXacroRuntimePanel = (
  payload: {
    available: boolean;
    runtime?: string;
    pythonExecutable: string;
    venvPath?: string;
  },
  statusLine: string
): AutoPreviewPanel => {
  const lines = [statusLine];
  if (payload.runtime) {
    lines.push(`runtime ${payload.runtime}`);
  }
  lines.push(`python ${quoteForPreview(payload.pythonExecutable)}`);
  if (payload.venvPath) {
    lines.push(`venv ${quoteForPreview(payload.venvPath)}`);
  }
  return {
    title: "xacro",
    kind: "info",
    lines,
  };
};

const runXacroBangCommand = (state: ShellState): ShellBangCommandResult => {
  const probeExecution = executeCliCommand("probe-xacro-runtime", new Map());
  const probePayload = parseExecutionJson<{
    available: boolean;
    runtime?: string;
    error?: string;
    pythonExecutable: string;
  }>(probeExecution);

  if (probePayload?.available) {
    const pendingRetry = state.xacroRetry;
    if (pendingRetry) {
      clearXacroRetry(state);
      const retryResult = pendingRetry(probePayload.pythonExecutable);
      return {
        panel: retryResult.panel,
        notice: retryResult.notice ?? { kind: "success", text: "retried automatically" },
        clearSession: retryResult.clearSession,
      };
    }
    return {
      panel: summarizeXacroRuntimePanel(probePayload, "xacro runtime ready"),
      notice: { kind: "success", text: "xacro runtime ready" },
    };
  }

  const setupExecution = executeCliCommand("setup-xacro-runtime", new Map());
  const setupPayload = parseExecutionJson<{
    available: boolean;
    runtime?: string;
    error?: string;
    pythonExecutable: string;
    venvPath: string;
  }>(setupExecution);

  if (setupPayload?.available) {
    const pendingRetry = state.xacroRetry;
    if (pendingRetry) {
      clearXacroRetry(state);
      const retryResult = pendingRetry(setupPayload.pythonExecutable);
      return {
        panel: retryResult.panel,
        notice: retryResult.notice ?? { kind: "success", text: "retried automatically" },
        clearSession: retryResult.clearSession,
      };
    }
    return {
      panel: summarizeXacroRuntimePanel(setupPayload, "xacro runtime installed"),
      notice: { kind: "success", text: "xacro runtime installed" },
    };
  }

  const panel = buildPreviewErrorPanel("xacro", setupExecution);
  return {
    panel,
    notice: buildShellFailureNotice(panel, "xacro setup failed"),
  };
};

const formatCount = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const buildPreviewErrorPanel = (
  title: string,
  execution: {
    stderr: string;
    stdout: string;
    status: number;
  }
): AutoPreviewPanel => {
  const combinedOutput = [execution.stderr, execution.stdout].filter(Boolean).join("\n").trim();
  if (isMissingXacroRuntimeErrorText(combinedOutput)) {
    return {
      title: "xacro",
      kind: "info",
      lines: [
        "xacro runtime not set",
        "run !xacro",
        "retry when setup finishes",
      ],
    };
  }

  const errorLines = (execution.stderr || execution.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    title,
    kind: "error",
    lines: errorLines.length > 0 ? errorLines.slice(0, 6) : [`preview failed with status ${execution.status}`],
  };
};

const isMissingXacroRuntimeErrorText = (text: string): boolean =>
  /no (python |vendored )?xacro runtime available/i.test(text) ||
  /install xacro or provide i_love_urdf_xacrodoc_wheel/i.test(text) ||
  /set up a local xacro runtime/i.test(text);

const buildShellFailureNotice = (
  panel: AutoPreviewPanel,
  fallbackText: string,
  fallbackKind: ShellFeedbackKind = "error"
): ShellFeedback => {
  if (panel?.title === "xacro") {
    return {
      kind: "warning",
      text: XACRO_RUNTIME_NOTICE,
    };
  }

  return {
    kind: fallbackKind,
    text: fallbackText,
  };
};

const summarizeRepositoryPreview = (
  session: ShellSession,
  payload: RepositoryPreviewPayload,
  options: {
    sourceLabelOverride?: string;
  } = {}
): AutoPreviewPanel => {
  const sourceLabel =
    options.sourceLabelOverride ??
    payload.repositoryUrl ??
    (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : payload.inspectedPath ?? "source");
  const lines = [`source ${sourceLabel}`];

  if (payload.candidateCount === 0) {
    lines.push("no URDF or XACRO entrypoints found");
    lines.push(
      session.label === "open"
        ? "paste the repo entry path if you already know it"
        : "use /open if you want to load a specific target path"
    );
    return {
      title: "preview",
      kind: "info",
      lines,
    };
  }

  lines.push(`found ${formatCount(payload.candidateCount, "candidate")}`);
  if (payload.primaryCandidatePath) {
    lines.push(`best match ${payload.primaryCandidatePath}`);
  }

  for (const [index, candidate] of payload.candidates.slice(0, 3).entries()) {
    const details = getCandidateDetails(candidate);
    lines.push(`${index + 1}. ${candidate.path}${details.length > 0 ? `  ${details.join("  ")}` : ""}`);
  }

  if (payload.candidateCount > 3) {
    lines.push(`+${payload.candidateCount - 3} more`);
  }

  lines.push(
    session.label === "open"
      ? payload.candidateCount === 1
        ? "press Enter to load the match"
        : "select a candidate below and press Enter to load it"
      : "next /open to load it, or /path to narrow the repo"
  );

  return {
    title: "preview",
    kind: "info",
    lines,
  };
};

const summarizeHealthPreview = (
  payload: {
    ok: boolean;
    summary: { errors: number; warnings: number; infos: number };
    findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
    orientationGuess?: {
      likelyUpAxis?: string | null;
      likelyForwardAxis?: string | null;
    };
  },
  urdfPath: string
): AutoPreviewPanel => {
  const lines = [`source ${quoteForPreview(urdfPath)}`];
  lines.push(
    payload.ok
      ? "looks healthy"
      : `${formatCount(payload.summary.errors, "error")}, ${formatCount(payload.summary.warnings, "warning")}, ${formatCount(payload.summary.infos, "info")}`
  );

  if (payload.orientationGuess?.likelyUpAxis && payload.orientationGuess?.likelyForwardAxis) {
    lines.push(
      `orientation likely ${payload.orientationGuess.likelyUpAxis}-up / ${payload.orientationGuess.likelyForwardAxis}-forward`
    );
  }

  for (const finding of payload.findings.slice(0, 2)) {
    const prefix = finding.context ? `${finding.context}: ` : "";
    lines.push(`${finding.level} ${prefix}${finding.message}`);
  }

  if (payload.findings.length > 2) {
    lines.push(`+${payload.findings.length - 2} more findings`);
  }

  lines.push("next /analyze or /orientation if you want a deeper review");

  return {
    title: "health",
    kind: payload.ok ? "success" : "info",
    lines,
  };
};

const summarizeAnalysisPreview = (
  payload: {
    isValid: boolean;
    error?: string;
    robotName: string | null;
    linkNames: string[];
    rootLinks: string[];
    meshReferences: string[];
    sensors?: unknown[];
    jointHierarchy?: { orderedJoints?: unknown[] };
  },
  urdfPath: string
): AutoPreviewPanel => {
  const jointCount = payload.jointHierarchy?.orderedJoints?.length ?? 0;
  const lines = [`source ${quoteForPreview(urdfPath)}`];

  if (!payload.isValid) {
    lines.push(payload.error || "could not analyze this URDF");
    return {
      title: "preview",
      kind: "error",
      lines,
    };
  }

  lines.push(payload.robotName ? `robot ${payload.robotName}` : "robot detected");
  lines.push(
    `${formatCount(payload.linkNames.length, "link")}  ${formatCount(jointCount, "joint")}  ${formatCount(payload.meshReferences.length, "mesh ref")}`
  );
  if ((payload.sensors?.length ?? 0) > 0) {
    lines.push(`${formatCount(payload.sensors?.length ?? 0, "sensor")}`);
  }
  if (payload.rootLinks.length > 0) {
    lines.push(
      payload.rootLinks.length === 1
        ? `root ${payload.rootLinks[0]}`
        : `${formatCount(payload.rootLinks.length, "root link")}`
    );
  }
  lines.push("next /health or /orientation if you want deeper review");

  return {
    title: "preview",
    kind: "info",
    lines,
  };
};

const summarizeInvestigateResult = (
  urdfPath: string,
  validation: {
    isValid: boolean;
    issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
  },
  health: {
    ok: boolean;
    summary: { errors: number; warnings: number; infos: number };
    findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
  },
  analysis: {
    isValid: boolean;
    error?: string;
    robotName: string | null;
    linkNames: string[];
    rootLinks: string[];
    meshReferences: string[];
    sensors?: unknown[];
    jointHierarchy?: { orderedJoints?: unknown[] };
  },
  orientation: {
    isValid: boolean;
    likelyUpAxis?: string | null;
    likelyForwardAxis?: string | null;
    confidence?: number;
    report?: { conflicts?: string[] };
  }
): AutoPreviewPanel => {
  const lines = [`source ${quoteForPreview(urdfPath)}`];
  const jointCount = analysis.jointHierarchy?.orderedJoints?.length ?? 0;
  const validationErrorCount = validation.issues.filter((issue) => issue.level === "error").length;
  const validationWarningCount = validation.issues.filter((issue) => issue.level === "warning").length;

  if (!analysis.isValid) {
    lines.push(analysis.error || "could not analyze this URDF");
    return {
      title: "investigation",
      kind: "error",
      lines,
    };
  }

  lines.push(analysis.robotName ? `robot ${analysis.robotName}` : "robot detected");
  lines.push(
    `${formatCount(analysis.linkNames.length, "link")}  ${formatCount(jointCount, "joint")}  ${formatCount(analysis.meshReferences.length, "mesh ref")}`
  );
  if ((analysis.sensors?.length ?? 0) > 0) {
    lines.push(`${formatCount(analysis.sensors?.length ?? 0, "sensor")}`);
  }

  if (validation.isValid && validation.issues.length === 0) {
    lines.push("validation passed");
  } else if (validation.isValid) {
    lines.push(`validation passed with ${formatCount(validationWarningCount, "warning")}`);
  } else {
    lines.push(`validation found ${formatCount(validationErrorCount, "error")} and ${formatCount(validationWarningCount, "warning")}`);
  }

  if (health.ok && health.summary.warnings === 0) {
    lines.push("health check passed");
  } else if (health.ok) {
    lines.push(`health check passed with ${formatCount(health.summary.warnings, "warning")}`);
  } else {
    lines.push(`health check found ${formatCount(health.summary.errors, "error")} and ${formatCount(health.summary.warnings, "warning")}`);
  }

  if (orientation.isValid && orientation.likelyUpAxis && orientation.likelyForwardAxis) {
    const confidence =
      typeof orientation.confidence === "number" && Number.isFinite(orientation.confidence)
        ? `  ${Math.round(orientation.confidence * 100)}%`
        : "";
    lines.push(`orientation likely ${orientation.likelyUpAxis}-up / ${orientation.likelyForwardAxis}-forward${confidence}`);
  }

  if (analysis.rootLinks.length > 0) {
    lines.push(
      analysis.rootLinks.length === 1
        ? `root ${analysis.rootLinks[0]}`
        : `${formatCount(analysis.rootLinks.length, "root link")}`
    );
  }

  const attentionLines: string[] = [];
  const needsAttention =
    !validation.isValid ||
    health.summary.errors > 0 ||
    health.summary.warnings > 0 ||
    analysis.meshReferences.length > 0;
  for (const issue of validation.issues.slice(0, 2)) {
    const prefix = issue.context ? `${issue.context}: ` : "";
    attentionLines.push(`${issue.level} ${prefix}${issue.message}`);
  }

  for (const finding of health.findings.filter((item) => item.level !== "info").slice(0, 2)) {
    const prefix = finding.context ? `${finding.context}: ` : "";
    const line = `${finding.level} ${prefix}${finding.message}`;
    if (!attentionLines.includes(line)) {
      attentionLines.push(line);
    }
    if (attentionLines.length >= 3) {
      break;
    }
  }

  if (analysis.meshReferences.length > 0) {
    attentionLines.push(`${formatCount(analysis.meshReferences.length, "mesh ref")} detected`);
  }

  const orientationConflict = orientation.report?.conflicts?.[0];
  if (needsAttention && orientationConflict) {
    attentionLines.push(`note ${orientationConflict}`);
  }

  if (attentionLines.length === 0) {
    lines.push("no obvious problems found");
  } else {
    for (const line of attentionLines.slice(0, 3)) {
      lines.push(line);
    }
  }

  if (needsAttention) {
    lines.push("best next step fix the URDF and rerun /analyze");
  } else {
    lines.push("looks ready");
  }
  lines.push("convert it when you need output");

  return {
    title: "investigation",
    kind:
      validation.isValid && health.ok && health.summary.warnings === 0 && attentionLines.length === 0
        ? "success"
        : "info",
    lines,
  };
};

const summarizeValidationResult = (
  payload: {
    isValid: boolean;
    issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
  },
  urdfPath: string
): AutoPreviewPanel => {
  const lines = [`source ${quoteForPreview(urdfPath)}`];
  const errorCount = payload.issues.filter((issue) => issue.level === "error").length;
  const warningCount = payload.issues.filter((issue) => issue.level === "warning").length;

  if (payload.isValid && payload.issues.length === 0) {
    lines.push("validation passed");
  } else if (payload.isValid) {
    lines.push(`validation passed with ${formatCount(warningCount, "warning")}`);
  } else {
    lines.push(`validation found ${formatCount(errorCount, "error")} and ${formatCount(warningCount, "warning")}`);
  }

  for (const issue of payload.issues.slice(0, 2)) {
    const prefix = issue.context ? `${issue.context}: ` : "";
    lines.push(`${issue.level} ${prefix}${issue.message}`);
  }
  if (payload.issues.length > 2) {
    lines.push(`+${payload.issues.length - 2} more issues`);
  }

  lines.push(payload.isValid ? "next /analyze or /orientation if you want more" : "fix the URDF and rerun /validate");

  return {
    title: "validation",
    kind: payload.isValid && payload.issues.length === 0 ? "success" : "info",
    lines,
  };
};

const summarizeOrientationResult = (
  payload: {
    isValid: boolean;
    likelyUpAxis?: string | null;
    likelyForwardAxis?: string | null;
    confidence?: number;
    signals?: Array<{ message?: string }>;
    report?: { conflicts?: string[] };
  },
  urdfPath: string
): AutoPreviewPanel => {
  const lines = [`source ${quoteForPreview(urdfPath)}`];

  if (!payload.isValid || !payload.likelyUpAxis || !payload.likelyForwardAxis) {
    lines.push("could not infer orientation confidently");
    return {
      title: "orientation",
      kind: "info",
      lines,
    };
  }

  lines.push(`orientation likely ${payload.likelyUpAxis}-up / ${payload.likelyForwardAxis}-forward`);
  if (typeof payload.confidence === "number" && Number.isFinite(payload.confidence)) {
    lines.push(`confidence ${Math.round(payload.confidence * 100)}%`);
  }

  const topSignal = payload.signals?.find((signal) => typeof signal.message === "string" && signal.message.trim().length > 0);
  if (topSignal?.message) {
    lines.push(topSignal.message.trim());
  }

  const topConflict = payload.report?.conflicts?.[0];
  if (topConflict) {
    lines.push(`note ${topConflict}`);
  }

  lines.push("if it looks wrong, fix the URDF and rerun /orientation");

  return {
    title: "orientation",
    kind: (payload.confidence ?? 0) >= 0.8 ? "success" : "info",
    lines,
  };
};

const resolveShellGitHubAccessToken = (session?: ShellSession): string | undefined => {
  const sessionToken = session?.args.get("token");
  if (typeof sessionToken === "string" && sessionToken.trim().length > 0) {
    return sessionToken.trim();
  }

  const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  return envToken || readGitHubCliToken() || undefined;
};

const sanitizeUrdfSnapshotName = (hint: string): string => {
  const normalized = path.basename(hint || "robot.urdf").replace(/\.(urdf\.xacro|xacro|zip)$/i, ".urdf");
  const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, "-");
  return safe.toLowerCase().endsWith(".urdf") ? safe : `${safe || "robot"}.urdf`;
};

const createTempUrdfSnapshotPath = (hint: string): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-loaded-"));
  return path.join(tempDir, sanitizeUrdfSnapshotName(hint));
};

const resolveExtractedArchiveRoot = (archiveRoot: string): string => {
  const entries = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store");

  if (entries.length === 1 && entries[0]?.isDirectory()) {
    return path.join(archiveRoot, entries[0].name);
  }

  return archiveRoot;
};

const resolveLoadableSourcePath = (
  sourcePath: string
): {
  workingPath: string;
  extractedArchivePath?: string;
} => {
  const localPath = detectLocalPathDrop(sourcePath);
  if (!localPath?.isZipFile) {
    return { workingPath: sourcePath };
  }

  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-archive-"));
  const archive = new AdmZip(localPath.absolutePath);
  archive.extractAllTo(archiveRoot, true);
  return {
    workingPath: resolveExtractedArchiveRoot(archiveRoot),
    extractedArchivePath: localPath.inputPath,
  };
};

const cloneArgsMap = (args: ReadonlyMap<string, string | boolean>): Map<string, string | boolean> =>
  new Map(args.entries());

const prepareLoadSourceArgs = (
  session: ShellSession
):
  | {
      execArgs: Map<string, string | boolean>;
      extractedArchivePath?: string;
    }
  | {
      error: AutoAutomationResult;
    } => {
  const execArgs = cloneArgsMap(session.args);
  let extractedArchivePath: string | undefined;

  const sourcePath = execArgs.get("path");
  if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
    try {
      const resolved = resolveLoadableSourcePath(sourcePath);
      execArgs.set("path", resolved.workingPath);
      extractedArchivePath = resolved.extractedArchivePath;
    } catch (error) {
      return {
        error: {
          panel: {
            title: "error",
            kind: "error",
            lines: [error instanceof Error ? error.message : String(error)],
          },
          notice: { kind: "error", text: "could not open archive" },
          clearSession: false,
        },
      };
    }
  }

  if (!execArgs.has("token")) {
    const token = resolveShellGitHubAccessToken(session);
    if (token) {
      execArgs.set("token", token);
    }
  }

  return { execArgs, extractedArchivePath };
};

const inspectRepositoryCandidatesForLoad = (
  session: ShellSession,
  execArgs: ReadonlyMap<string, string | boolean>,
  options: {
    extractedArchivePath?: string;
  } = {}
): {
  payload: RepositoryPreviewPayload;
  panel: AutoPreviewPanel;
} | null => {
  const previewArgs = new Map<string, string | boolean>();
  const github = execArgs.get("github");
  const sourcePath = execArgs.get("path");

  if (typeof github === "string" && github.trim().length > 0) {
    previewArgs.set("github", github);
  } else if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
    const localPath = detectLocalPathDrop(sourcePath);
    if (!localPath?.isDirectory) {
      return null;
    }
    previewArgs.set("local", sourcePath);
  } else {
    return null;
  }

  const execution = executeCliCommand("inspect-repo", previewArgs);
  const payload = parseExecutionJson<RepositoryPreviewPayload>(execution);
  if (!payload) {
    return {
      payload: {
        candidateCount: 0,
        primaryCandidatePath: null,
        candidates: [],
      },
      panel: buildPreviewErrorPanel("preview", execution),
    };
  }

  return {
    payload,
    panel: summarizeRepositoryPreview(session, payload, {
      sourceLabelOverride: options.extractedArchivePath
        ? quoteForPreview(options.extractedArchivePath)
        : undefined,
    }),
  };
};

const executeLoadSourceChecks = (
  state: ShellState,
  execArgs: ReadonlyMap<string, string | boolean>,
  options: {
    extractedArchivePath?: string;
    requestedEntryPath?: string;
  } = {}
): AutoAutomationResult => {
  const loadArgs = cloneArgsMap(execArgs);
  const outputPath = createTempUrdfSnapshotPath(
    String(loadArgs.get("entry") || loadArgs.get("path") || loadArgs.get("github") || "robot.urdf")
  );
  loadArgs.set("out", outputPath);

  const loadExecution = executeCliCommand("load-source", loadArgs);
  const loadPayload = parseExecutionJson<LoadSourceResult & { outPath: string | null }>(loadExecution);
  if (!loadPayload || !loadPayload.outPath) {
    const panel = buildPreviewErrorPanel("error", loadExecution);
    if (panel?.title === "xacro") {
      const retryArgs = cloneArgsMap(execArgs);
      const retryOptions = {
        extractedArchivePath: options.extractedArchivePath,
        requestedEntryPath: options.requestedEntryPath,
      };
      state.xacroRetry = (pythonExecutable) => {
        const nextRetryArgs = cloneArgsMap(retryArgs);
        if (pythonExecutable && !nextRetryArgs.has("python")) {
          nextRetryArgs.set("python", pythonExecutable);
        }
        return executeLoadSourceChecks(state, nextRetryArgs, retryOptions);
      };
    } else {
      clearXacroRetry(state);
    }
    return {
      panel,
      notice: buildShellFailureNotice(panel, "could not load source"),
      clearSession: false,
    };
  }

  clearXacroRetry(state);

  state.lastUrdfPath = loadPayload.outPath;
  rememberLoadedSource(state, loadPayload, {
    githubRef: typeof execArgs.get("github") === "string" ? String(execArgs.get("github")) : undefined,
  });

  const validationExecution = executeCliCommand(
    "validate",
    new Map([["urdf", loadPayload.outPath]])
  );
  const healthExecution = executeCliCommand(
    "health-check",
    new Map([["urdf", loadPayload.outPath]])
  );

  const validationPayload = parseExecutionJson<{
    isValid: boolean;
    issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
  }>(validationExecution);
  const healthPayload = parseExecutionJson<{
    ok: boolean;
    summary: { errors: number; warnings: number; infos: number };
    findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
    orientationGuess?: {
      likelyUpAxis?: string | null;
      likelyForwardAxis?: string | null;
    };
  }>(healthExecution);

  if (!validationPayload || !healthPayload) {
    const panel = buildPreviewErrorPanel(
      "error",
      !validationPayload ? validationExecution : healthExecution
    );
    clearXacroRetry(state);
    return {
      panel,
      notice: buildShellFailureNotice(panel, "validation failed to run"),
      clearSession: false,
    };
  }

  const panel = summarizeAutoLoadChecks(loadPayload, validationPayload, healthPayload, {
    extractedArchivePath: options.extractedArchivePath,
    requestedEntryPath: options.requestedEntryPath,
  });

  return {
    panel,
    notice: {
      kind: panel.kind === "success" ? "success" : "info",
      text:
        panel.kind === "success"
          ? "validation and health check passed"
          : "source loaded. review the checks",
    },
    clearSession: true,
  };
};

const runSelectedCandidatePicker = (
  state: ShellState,
  selectionPath: string
): AutoAutomationResult | null => {
  const picker = state.candidatePicker;
  if (!picker) {
    return null;
  }

  const execArgs = cloneArgsMap(picker.loadArgs);
  execArgs.set("entry", selectionPath);
  return executeLoadSourceChecks(state, execArgs, {
    extractedArchivePath: picker.extractedArchivePath,
    requestedEntryPath: selectionPath,
  });
};

const summarizeAutoLoadChecks = (
  loadResult: LoadSourceResult & { outPath: string | null },
  validation: {
    isValid: boolean;
    issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
  },
  health: {
    ok: boolean;
    summary: { errors: number; warnings: number; infos: number };
    findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
    orientationGuess?: {
      likelyUpAxis?: string | null;
      likelyForwardAxis?: string | null;
    };
  },
  options: {
    extractedArchivePath?: string;
    requestedEntryPath?: string;
  } = {}
): AutoPreviewPanel => {
  const lines: string[] = [];

  if (options.extractedArchivePath) {
    lines.push(`opened archive ${quoteForPreview(options.extractedArchivePath)}`);
  }

  if (loadResult.repositoryUrl) {
    lines.push(`source ${loadResult.repositoryUrl}`);
  } else {
    lines.push(`source ${quoteForPreview(loadResult.inspectedPath)}`);
  }

  lines.push(`loaded ${loadResult.entryPath}`);

  if ((loadResult.candidateCount ?? 0) > 1) {
    lines.push(
      options.requestedEntryPath === loadResult.entryPath
        ? `selected ${loadResult.entryPath} from ${formatCount(loadResult.candidateCount ?? 0, "candidate")}`
        : `picked best match from ${formatCount(loadResult.candidateCount ?? 0, "candidate")}`
    );
  }

  lines.push(
    validation.isValid
      ? "validation passed"
      : `validation found ${formatCount(validation.issues.filter((issue) => issue.level === "error").length, "error")} and ${formatCount(validation.issues.filter((issue) => issue.level === "warning").length, "warning")}`
  );

  if (health.ok && health.summary.warnings === 0) {
    lines.push("health check passed");
  } else if (health.ok) {
    lines.push(`health check passed with ${formatCount(health.summary.warnings, "warning")}`);
  } else {
    lines.push(
      `health check found ${formatCount(health.summary.errors, "error")} and ${formatCount(health.summary.warnings, "warning")}`
    );
  }

  if (health.orientationGuess?.likelyUpAxis && health.orientationGuess?.likelyForwardAxis) {
    lines.push(
      `orientation likely ${health.orientationGuess.likelyUpAxis}-up / ${health.orientationGuess.likelyForwardAxis}-forward`
    );
  }

  for (const finding of health.findings.slice(0, 2)) {
    if (health.ok && health.summary.warnings === 0 && finding.level === "info") {
      continue;
    }
    const prefix = finding.context ? `${finding.context}: ` : "";
    lines.push(`${finding.level} ${prefix}${finding.message}`);
  }

  lines.push("next /analyze /health /validate /orientation or paste another source");

  return {
    title: "loaded",
    kind: validation.isValid && health.ok && health.summary.warnings === 0 ? "success" : "info",
    lines,
  };
};

const summarizeDirectUrdfChecks = (
  urdfPath: string,
  validation: {
    isValid: boolean;
    issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
  },
  health: {
    ok: boolean;
    summary: { errors: number; warnings: number; infos: number };
    findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
    orientationGuess?: {
      likelyUpAxis?: string | null;
      likelyForwardAxis?: string | null;
    };
  }
): AutoPreviewPanel => {
  const lines = [`source ${quoteForPreview(urdfPath)}`];

  lines.push(
    validation.isValid
      ? "validation passed"
      : `validation found ${formatCount(validation.issues.filter((issue) => issue.level === "error").length, "error")} and ${formatCount(validation.issues.filter((issue) => issue.level === "warning").length, "warning")}`
  );

  if (health.ok && health.summary.warnings === 0) {
    lines.push("health check passed");
  } else if (health.ok) {
    lines.push(`health check passed with ${formatCount(health.summary.warnings, "warning")}`);
  } else {
    lines.push(
      `health check found ${formatCount(health.summary.errors, "error")} and ${formatCount(health.summary.warnings, "warning")}`
    );
  }

  if (health.orientationGuess?.likelyUpAxis && health.orientationGuess?.likelyForwardAxis) {
    lines.push(
      `orientation likely ${health.orientationGuess.likelyUpAxis}-up / ${health.orientationGuess.likelyForwardAxis}-forward`
    );
  }

  for (const finding of health.findings.slice(0, 2)) {
    if (health.ok && health.summary.warnings === 0 && finding.level === "info") {
      continue;
    }
    const prefix = finding.context ? `${finding.context}: ` : "";
    lines.push(`${finding.level} ${prefix}${finding.message}`);
  }

  lines.push("next /analyze /health /validate /orientation or paste another source");

  return {
    title: "checks",
    kind: validation.isValid && health.ok && health.summary.warnings === 0 ? "success" : "info",
    lines,
  };
};

const runDirectInputAutomation = (
  state: ShellState,
  session: ShellSession,
  changedKey: string
): AutoAutomationResult | null => {
  if (session.command === "load-source" && (changedKey === "github" || changedKey === "path" || changedKey === "entry")) {
    const requirementStatus = getRequirementStatus(session);
    if (!requirementStatus.ready) {
      return null;
    }

    const prepared = prepareLoadSourceArgs(session);
    if ("error" in prepared) {
      return prepared.error;
    }

    const { execArgs, extractedArchivePath } = prepared;
    const hasExplicitEntry =
      typeof execArgs.get("entry") === "string" && String(execArgs.get("entry")).trim().length > 0;

    if (!hasExplicitEntry && (changedKey === "github" || changedKey === "path")) {
      const preview = inspectRepositoryCandidatesForLoad(session, execArgs, {
        extractedArchivePath,
      });
      if (preview) {
        if (preview.panel.kind === "error") {
          clearCandidatePicker(state);
          return {
            panel: preview.panel,
            notice: { kind: "error", text: "preview failed" },
            clearSession: false,
          };
        }

        if (preview.payload.candidateCount === 0) {
          clearCandidatePicker(state);
          return {
            panel: preview.panel,
            notice: { kind: "info", text: "preview ready" },
            clearSession: false,
          };
        }

        if (preview.payload.candidateCount > 1) {
          state.candidatePicker = {
            candidates: preview.payload.candidates,
            selectedIndex: 0,
            loadArgs: cloneArgsMap(execArgs),
            extractedArchivePath,
          };
          return {
            panel: preview.panel,
            notice: { kind: "info", text: "choose a candidate. arrows move, enter loads" },
            clearSession: false,
          };
        }

        if (preview.payload.primaryCandidatePath) {
          execArgs.set("entry", preview.payload.primaryCandidatePath);
        }
      } else {
        clearCandidatePicker(state);
      }
    }

    clearCandidatePicker(state);
    return executeLoadSourceChecks(state, execArgs, {
      extractedArchivePath,
      requestedEntryPath:
        typeof execArgs.get("entry") === "string" ? String(execArgs.get("entry")) : undefined,
    });
  }

  if (
    ((session.command === "analyze" || session.command === "validate" || session.command === "guess-orientation") &&
      changedKey === "urdf") ||
    (session.command === "inspect-repo" && (changedKey === "github" || changedKey === "local"))
  ) {
    clearCandidatePicker(state);
    const execution = executeSessionCommand(state, session);
    if (execution.status !== 0) {
      const panel = getShellExecutionFailurePanel(execution, session.command);
      return {
        panel,
        notice: buildShellFailureNotice(panel, `${session.label} failed`),
        clearSession: false,
      };
    }

    const panel =
      getShellExecutionSuccessPanel(session, execution) ??
      createOutputPanel("result", buildExecutionPanelText(execution, session.command), "success");

    return {
      panel,
      notice: {
        kind: panel?.kind === "error" ? "error" : panel?.kind === "success" ? "success" : "info",
        text:
          session.command === "inspect-repo"
            ? "inspection complete"
            : session.command === "validate"
              ? "validation complete"
              : session.command === "guess-orientation"
                ? "orientation complete"
                : "analysis complete",
      },
      clearSession: true,
    };
  }

  if (session.command === "health-check" && changedKey === "urdf") {
    clearCandidatePicker(state);
    const urdfPath = session.args.get("urdf");
    if (typeof urdfPath !== "string" || urdfPath.trim().length === 0) {
      return null;
    }

    state.lastUrdfPath = urdfPath;
    rememberDirectUrdfSource(state, urdfPath);

    const validationExecution = executeCliCommand("validate", new Map([["urdf", urdfPath]]));
    const healthExecution = executeCliCommand("health-check", new Map([["urdf", urdfPath]]));
    const validationPayload = parseExecutionJson<{
      isValid: boolean;
      issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
    }>(validationExecution);
    const healthPayload = parseExecutionJson<{
      ok: boolean;
      summary: { errors: number; warnings: number; infos: number };
      findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
      orientationGuess?: {
        likelyUpAxis?: string | null;
        likelyForwardAxis?: string | null;
      };
    }>(healthExecution);

    if (!validationPayload || !healthPayload) {
      const panel = buildPreviewErrorPanel("error", !validationPayload ? validationExecution : healthExecution);
      return {
        panel,
        notice: buildShellFailureNotice(panel, "checks failed to run"),
        clearSession: false,
      };
    }

    const panel = summarizeDirectUrdfChecks(urdfPath, validationPayload, healthPayload);
    return {
      panel,
      notice: {
        kind: panel.kind === "success" ? "success" : "info",
        text:
          panel.kind === "success"
            ? "validation and health check passed"
            : "checks complete. review the results",
      },
      clearSession: true,
    };
  }

  return null;
};

const applyValueChangeEffects = (
  state: ShellState,
  session: ShellSession,
  changedKey: string
): {
  automation: AutoAutomationResult | null;
  preview: AutoPreviewPanel;
} => {
  const automation = runDirectInputAutomation(state, session, changedKey);
  if (automation) {
    return {
      automation,
      preview: automation.panel,
    };
  }

  return {
    automation: null,
    preview: buildAutoPreviewPanel(state, session, changedKey),
  };
};

const buildAutoPreviewPanel = (
  state: ShellState,
  session: ShellSession,
  changedKey: string
): AutoPreviewPanel => {
  clearCandidatePicker(state);
  let previewCommand: SupportedCommandName | null = null;
  const previewArgs = new Map<string, string | boolean>();

  if (session.command === "load-source" && (changedKey === "github" || changedKey === "path")) {
    const github = session.args.get("github");
    const sourcePath = session.args.get("path");

    if (typeof github === "string" && github.trim().length > 0) {
      previewCommand = "inspect-repo";
      previewArgs.set("github", github);
    } else if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
      const localPath = detectLocalPathDrop(sourcePath);
      if (localPath?.isDirectory) {
        previewCommand = "inspect-repo";
        previewArgs.set("local", sourcePath);
      } else if (localPath?.isUrdfFile) {
        previewCommand = "health-check";
        previewArgs.set("urdf", sourcePath);
      }
    }
  } else if (
    session.command === "inspect-repo" &&
    (changedKey === "github" || changedKey === "local")
  ) {
    const github = session.args.get("github");
    const local = session.args.get("local");
    if (typeof github === "string" && github.trim().length > 0) {
      previewCommand = "inspect-repo";
      previewArgs.set("github", github);
    } else if (typeof local === "string" && local.trim().length > 0) {
      previewCommand = "inspect-repo";
      previewArgs.set("local", local);
    }
  } else if (
    (session.command === "health-check" || session.command === "analyze") &&
    changedKey === "urdf"
  ) {
    const urdfPath = session.args.get("urdf");
    if (typeof urdfPath === "string" && urdfPath.trim().length > 0) {
      previewCommand = session.command;
      previewArgs.set("urdf", urdfPath);
    }
  }

  if (!previewCommand) {
    return null;
  }

  const execution = executeCliCommand(previewCommand, previewArgs);
  if (execution.status !== 0) {
    return buildPreviewErrorPanel("preview", execution);
  }

  if (previewCommand === "inspect-repo") {
    const payload = parseExecutionJson<RepositoryPreviewPayload>(execution);
    return payload ? summarizeRepositoryPreview(session, payload) : buildPreviewErrorPanel("preview", execution);
  }

  if (previewCommand === "health-check") {
    const payload = parseExecutionJson<{
      ok: boolean;
      summary: { errors: number; warnings: number; infos: number };
      findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
      orientationGuess?: {
        likelyUpAxis?: string | null;
        likelyForwardAxis?: string | null;
      };
    }>(execution);
    const urdfPath = String(previewArgs.get("urdf") || "");
    if (payload && urdfPath) {
      state.lastUrdfPath = urdfPath;
      rememberDirectUrdfSource(state, urdfPath);
      return summarizeHealthPreview(payload, urdfPath);
    }
    return buildPreviewErrorPanel("health", execution);
  }

  if (previewCommand === "analyze") {
    const payload = parseExecutionJson<{
      isValid: boolean;
      error?: string;
      robotName: string | null;
      linkNames: string[];
      rootLinks: string[];
      meshReferences: string[];
      sensors?: unknown[];
      jointHierarchy?: { orderedJoints?: unknown[] };
    }>(execution);
    const urdfPath = String(previewArgs.get("urdf") || "");
    if (payload && urdfPath) {
      state.lastUrdfPath = urdfPath;
      rememberDirectUrdfSource(state, urdfPath);
      return summarizeAnalysisPreview(payload, urdfPath);
    }
    return buildPreviewErrorPanel("preview", execution);
  }

  return null;
};

const executeSessionCommand = (
  state: ShellState,
  session: ShellSession
): {
  preview: string;
  stdout: string;
  stderr: string;
  status: number;
  followUp: string | null;
  shellPanel?: AutoPreviewPanel;
} => {
  if (session.command === "analyze") {
    const urdfPath = session.args.get("urdf");
    if (typeof urdfPath === "string" && urdfPath.trim().length > 0) {
      const validationExecution = executeCliCommand("validate", new Map([["urdf", urdfPath]]));
      if (validationExecution.status !== 0) {
        return {
          preview: validationExecution.preview,
          stdout: validationExecution.stdout,
          stderr: validationExecution.stderr,
          status: validationExecution.status,
          followUp: null,
        };
      }

      const healthExecution = executeCliCommand("health-check", new Map([["urdf", urdfPath]]));
      if (healthExecution.status !== 0) {
        return {
          preview: healthExecution.preview,
          stdout: healthExecution.stdout,
          stderr: healthExecution.stderr,
          status: healthExecution.status,
          followUp: null,
        };
      }

      const orientationExecution = executeCliCommand("guess-orientation", new Map([["urdf", urdfPath]]));
      if (orientationExecution.status !== 0) {
        return {
          preview: orientationExecution.preview,
          stdout: orientationExecution.stdout,
          stderr: orientationExecution.stderr,
          status: orientationExecution.status,
          followUp: null,
        };
      }

      const analysisExecution = executeCliCommand("analyze", session.args);
      if (analysisExecution.status !== 0) {
        return {
          preview: analysisExecution.preview,
          stdout: analysisExecution.stdout,
          stderr: analysisExecution.stderr,
          status: analysisExecution.status,
          followUp: null,
        };
      }

      const validationPayload = parseExecutionJson<{
        isValid: boolean;
        issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
      }>(validationExecution);
      const healthPayload = parseExecutionJson<{
        ok: boolean;
        summary: { errors: number; warnings: number; infos: number };
        findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
      }>(healthExecution);
      const orientationPayload = parseExecutionJson<{
        isValid: boolean;
        likelyUpAxis?: string | null;
        likelyForwardAxis?: string | null;
        confidence?: number;
        report?: { conflicts?: string[] };
      }>(orientationExecution);
      const analysisPayload = parseExecutionJson<{
        isValid: boolean;
        error?: string;
        robotName: string | null;
        linkNames: string[];
        rootLinks: string[];
        meshReferences: string[];
        sensors?: unknown[];
        jointHierarchy?: { orderedJoints?: unknown[] };
      }>(analysisExecution);

      if (!validationPayload || !healthPayload || !orientationPayload || !analysisPayload) {
        return {
          preview: analysisExecution.preview,
          stdout: analysisExecution.stdout,
          stderr: analysisExecution.stderr,
          status: analysisExecution.status,
          followUp: null,
        };
      }

      updateRememberedUrdfPath(state, session);
      return {
        preview: analysisExecution.preview,
        stdout: "",
        stderr: "",
        status: 0,
        followUp: getFollowUpSuggestionMessage(state, session.command),
        shellPanel: summarizeInvestigateResult(
          urdfPath,
          validationPayload,
          healthPayload,
          analysisPayload,
          orientationPayload
        ),
      };
    }
  }

  const result = executeCliCommand(session.command, session.args);
  const status = result.status;
  if (status === 0) {
    updateRememberedUrdfPath(state, session);
  }

  return {
    preview: result.preview,
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    followUp: status === 0 ? getFollowUpSuggestionMessage(state, session.command) : null,
  };
};

const getShellExecutionSuccessPanel = (
  session: ShellSession,
  execution: ReturnType<typeof executeSessionCommand>
): AutoPreviewPanel => {
  if (execution.status !== 0) {
    return null;
  }

  if (execution.shellPanel) {
    return execution.shellPanel;
  }

  switch (session.command) {
    case "inspect-repo": {
      const payload = parseExecutionJson<RepositoryPreviewPayload>(execution);
      return payload ? summarizeRepositoryPreview(session, payload) : null;
    }
    case "health-check": {
      const payload = parseExecutionJson<{
        ok: boolean;
        summary: { errors: number; warnings: number; infos: number };
        findings: Array<{ level: "error" | "warning" | "info"; message: string; context?: string }>;
        orientationGuess?: {
          likelyUpAxis?: string | null;
          likelyForwardAxis?: string | null;
        };
      }>(execution);
      const urdfPath = session.args.get("urdf");
      return payload && typeof urdfPath === "string" ? summarizeHealthPreview(payload, urdfPath) : null;
    }
    case "analyze": {
      const payload = parseExecutionJson<{
        isValid: boolean;
        error?: string;
        robotName: string | null;
        linkNames: string[];
        rootLinks: string[];
        meshReferences: string[];
        sensors?: unknown[];
        jointHierarchy?: { orderedJoints?: unknown[] };
      }>(execution);
      const urdfPath = session.args.get("urdf");
      return payload && typeof urdfPath === "string" ? summarizeAnalysisPreview(payload, urdfPath) : null;
    }
    case "validate": {
      const payload = parseExecutionJson<{
        isValid: boolean;
        issues: Array<{ level: "error" | "warning"; message: string; context?: string }>;
      }>(execution);
      const urdfPath = session.args.get("urdf");
      return payload && typeof urdfPath === "string" ? summarizeValidationResult(payload, urdfPath) : null;
    }
    case "guess-orientation": {
      const payload = parseExecutionJson<{
        isValid: boolean;
        likelyUpAxis?: string | null;
        likelyForwardAxis?: string | null;
        confidence?: number;
        signals?: Array<{ message?: string }>;
        report?: { conflicts?: string[] };
      }>(execution);
      const urdfPath = session.args.get("urdf");
      return payload && typeof urdfPath === "string" ? summarizeOrientationResult(payload, urdfPath) : null;
    }
    default:
      return null;
  }
};

const tryCreateLoadedRootQuickSession = (
  state: ShellState,
  command: SupportedCommandName
): ShellSession | null => {
  if (!AUTO_RUN_READY_COMMANDS.has(command)) {
    return null;
  }

  const session = createSession(command, state, command);
  return getRequirementStatus(session).ready ? session : null;
};

const shouldAutoRunSession = (session: ShellSession): boolean =>
  AUTO_RUN_READY_COMMANDS.has(session.command) && getRequirementStatus(session).ready;

const getRootIdleMessage = (state: Pick<ShellState, "lastUrdfPath">): string =>
  state.lastUrdfPath
    ? "nothing is pending. use /analyze /health /validate /orientation or paste another source"
    : "nothing is pending. paste a source or use /open /inspect /analyze /health";

const getShellExecutionFailurePanel = (
  execution: ReturnType<typeof executeSessionCommand>,
  command: SupportedCommandName
): AutoPreviewPanel => {
  const combinedOutput = [execution.stderr, execution.stdout].filter(Boolean).join("\n").trim();
  if (
    command === "xacro-to-urdf" &&
    isMissingXacroRuntimeErrorText(combinedOutput)
  ) {
    return {
      title: "xacro",
      kind: "info",
      lines: [
        "xacro runtime not set",
        "run !xacro",
        "retry /run when setup finishes",
      ],
    };
  }

  return null;
};

const printSessionCommandExecution = (
  execution: ReturnType<typeof executeSessionCommand>,
  session: ShellSession
) => {
  const compactFailurePanel = execution.status !== 0 ? getShellExecutionFailurePanel(execution, session.command) : null;
  if (compactFailurePanel) {
    writeFeedback(buildShellFailureNotice(compactFailurePanel, `[${session.command}] exited with status ${execution.status}`));
    printOutputPanel(compactFailurePanel);
    return;
  }

  const successPanel = getShellExecutionSuccessPanel(session, execution);
  if (successPanel) {
    printOutputPanel(successPanel);
    if (execution.followUp) {
      for (const line of execution.followUp.split("\n")) {
        if (line.startsWith("[next]")) {
          process.stdout.write(`${SHELL_THEME.accent(line)}\n`);
        } else {
          process.stdout.write(`${SHELL_THEME.muted(line)}\n`);
        }
      }
    }
    return;
  }

  process.stdout.write(`\n${formatStatusTag("cmd")} ${SHELL_THEME.command(execution.preview)}\n`);
  if (execution.stdout) {
    process.stdout.write(execution.stdout);
  }
  if (execution.stderr) {
    process.stderr.write(execution.stderr);
  }
  if (execution.status !== 0) {
    process.stderr.write(`[${session.command}] exited with status ${execution.status}\n`);
    return;
  }
  if (execution.followUp) {
    for (const line of execution.followUp.split("\n")) {
      if (line.startsWith("[next]")) {
        process.stdout.write(`${SHELL_THEME.accent(line)}\n`);
      } else {
        process.stdout.write(`${SHELL_THEME.muted(line)}\n`);
      }
    }
  }
};

const createSession = (
  command: SupportedCommandName,
  state: ShellState,
  label: string = command,
  feedback?: ShellFeedback[]
): ShellSession => {
  const session: ShellSession = {
    command,
    label,
    spec: COMMAND_COMPLETION_SPEC_BY_NAME[command],
    args: new Map<string, string | boolean>(),
    inheritedKeys: new Set<string>(),
    pending: null,
  };

  const inheritedValues: Array<[string, string]> = [];
  const source = state.loadedSource;

  const canInheritLocalSource =
    source?.localPath &&
    getOptionSpecByKey(session, "local") &&
    (session.command === "inspect-repo" ||
      session.command === "repair-mesh-refs" ||
      (session.command === "xacro-to-urdf" && source?.source === "local-repo"));
  if (canInheritLocalSource && source?.localPath) {
    session.args.set("local", source.localPath);
    session.inheritedKeys.add("local");
    inheritedValues.push(["local", source.localPath]);
  }

  const canInheritGitHubSource =
    source?.githubRef &&
    getOptionSpecByKey(session, "github") &&
    (session.command === "inspect-repo" ||
      session.command === "repair-mesh-refs" ||
      session.command === "xacro-to-urdf");
  if (canInheritGitHubSource && source?.githubRef) {
    session.args.set("github", source.githubRef);
    session.inheritedKeys.add("github");
    inheritedValues.push(["github", source.githubRef]);
  }

  if (source?.urdfPath && getOptionSpecByKey(session, "urdf")) {
    session.args.set("urdf", source.urdfPath);
    session.inheritedKeys.add("urdf");
    inheritedValues.push(["urdf", source.urdfPath]);
  } else if (state.lastUrdfPath && getOptionSpecByKey(session, "urdf")) {
    session.args.set("urdf", state.lastUrdfPath);
    session.inheritedKeys.add("urdf");
    inheritedValues.push(["urdf", state.lastUrdfPath]);
  }

  if (
    source?.repositoryUrdfPath &&
    command === "repair-mesh-refs" &&
    getOptionSpecByKey(session, "urdf") &&
    (session.args.has("local") || session.args.has("github"))
  ) {
    session.args.set("urdf", source.repositoryUrdfPath);
    session.inheritedKeys.add("urdf");
    inheritedValues.push(["urdf", source.repositoryUrdfPath]);
  }

  if (inheritedValues.length > 0) {
    const primaryInherited = inheritedValues[0]?.[1];
    if (primaryInherited) {
      pushFeedback(feedback, "info", `using ${primaryInherited}`);
    }
  }

  return session;
};

const resolveSessionSlashTarget = (
  session: ShellSession,
  slashCommand: string
): {
  key: string;
  option: CompletionOptionSpec;
} | null => {
  const aliases = getSlashAliasesForCommand(session.command);
  const key = aliases[slashCommand] ?? slashCommand;
  const option = getOptionSpecByKey(session, key);
  return option ? { key, option } : null;
};

const listAvailableSlashCommands = (state: ShellState): string[] => {
  if (state.session) {
    return [
      ...new Set([
        ...getSessionMenuEntries(state.session).map((entry) => entry.name),
        ...HIDDEN_SHELL_COMMAND_NAMES,
      ]),
    ];
  }

  return [
    ...new Set([
      ...getRootMenuEntries(state).map((entry) => entry.name),
      ...SHELL_BUILTIN_COMMANDS.map((entry) => entry.name),
      ...HIDDEN_SHELL_COMMAND_NAMES,
      ...CLI_HELP_SECTIONS.flatMap((section) => section.commands),
    ]),
  ];
};

const listRecognizedSlashCommands = (state: ShellState): string[] => {
  const commands = new Set(listAvailableSlashCommands(state));

  if (!state.session) {
    commands.add("run");
  }

  return [...commands];
};

const completePathFragment = (fragment: string): string[] => {
  const raw = fragment.length > 0 ? fragment : ".";
  const expanded = raw.startsWith("~") ? path.join(process.env.HOME ?? "", raw.slice(1)) : raw;
  const dirname = path.dirname(expanded);
  const basename = path.basename(expanded);
  const directory = dirname === "." && !expanded.startsWith(".") ? "." : dirname;

  try {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.name.startsWith(basename))
      .map((entry) => {
        const fullPath = path.join(directory, entry.name);
        const rendered =
          raw.startsWith("~") && fullPath.startsWith(process.env.HOME ?? "")
            ? `~${fullPath.slice((process.env.HOME ?? "").length)}`
            : fullPath;
        return entry.isDirectory() ? `${rendered}/` : rendered;
      });
  } catch {
    return [];
  }
};

const createCompleter = (state: ShellState) => {
  return (line: string): [string[], string] => {
    const trimmed = line.trimStart();

    if (state.session?.pending && !shouldTreatAsSlashInput(trimmed, state)) {
      if (!state.session.pending.expectsPath) {
        return [[], line];
      }

      return [completePathFragment(trimmed), line];
    }

    if (!shouldTreatAsSlashInput(trimmed, state)) {
      return [[], line];
    }

    const parsed = parseSlashInput(trimmed);
    if (!parsed) {
      return [[], line];
    }

    if (!parsed.inlineValue) {
      const candidates = listAvailableSlashCommands(state).map((entry) => `/${entry}`);
      const matches = candidates.filter((entry) => entry.startsWith(trimmed));
      return [matches.length > 0 ? matches : candidates, line];
    }

    if (!state.session) {
      return [[], line];
    }

    const target = resolveSessionSlashTarget(state.session, parsed.slashCommand);
    if (!target || target.key === "github" || !isPathLikeOption(state.session, target.key)) {
      return [[], line];
    }

    const matches = completePathFragment(parsed.inlineValue).map(
      (match) => `/${parsed.slashCommand} ${match}`
    );
    return [matches, line];
  };
};

const openPendingForSession = (
  session: ShellSession,
  pending: RootTaskActionDefinition["openPending"] | undefined
) => {
  if (!pending) {
    return;
  }
  if (pending.onlyIfMissing && session.args.has(pending.key)) {
    return;
  }
  session.pending = getPendingValuePrompt(session, pending.key, pending.slashName);
};

const inferFreeformSessionTarget = (
  session: ShellSession,
  rawValue: string
): FreeformSessionTarget | null => {
  const githubValue = detectGitHubReferenceInput(rawValue);
  if (
    githubValue &&
    getOptionSpecByKey(session, "github") &&
    !session.args.has("github") &&
    !session.args.has("path") &&
    !session.args.has("local")
  ) {
    return {
      key: "github",
      slashName: "repo",
      value: githubValue,
    };
  }

  const localPath = detectLocalPathDrop(rawValue);
  if (!localPath) {
    return null;
  }

  if (session.command === "load-source" && !session.args.has("path") && !session.args.has("github")) {
    return {
      key: "path",
      slashName: localPath.isDirectory ? "local" : "file",
      value: localPath.inputPath,
    };
  }

  if (session.command === "inspect-repo" && localPath.isDirectory && !session.args.has("local") && !session.args.has("github")) {
    return {
      key: "local",
      slashName: "local",
      value: localPath.inputPath,
    };
  }

  if (session.command === "repair-mesh-refs" && !session.args.has("local") && !session.args.has("github")) {
    return {
      key: "local",
      slashName: "local",
      value: localPath.inputPath,
    };
  }

  if (session.command === "xacro-to-urdf") {
    if (localPath.isXacroFile && !session.args.has("xacro")) {
      return {
        key: "xacro",
        slashName: "file",
        value: localPath.inputPath,
      };
    }

    if (localPath.isDirectory && !session.args.has("local") && !session.args.has("github")) {
      return {
        key: "local",
        slashName: "local",
        value: localPath.inputPath,
      };
    }
  }

  if (
    localPath.isUrdfFile &&
    getOptionSpecByKey(session, "urdf") &&
    !session.args.has("urdf")
  ) {
    return {
      key: "urdf",
      slashName: "file",
      value: localPath.inputPath,
    };
  }

  return null;
};

const inferFreeformRootPlan = (state: ShellState, rawValue: string): FreeformRootPlan | null => {
  const githubValue = detectGitHubReferenceInput(rawValue);
  const localPath = detectLocalPathDrop(rawValue);
  const task = state.rootTask;

  if (!task) {
    if (githubValue) {
      return {
        rootTask: "open",
        command: "load-source",
        label: "open",
        key: "github",
        slashName: "repo",
        value: githubValue,
      };
    }

    if (localPath?.isUrdfFile) {
      return {
        rootTask: "check",
        command: "health-check",
        label: "health",
        key: "urdf",
        slashName: "file",
        value: localPath.inputPath,
      };
    }

    if (localPath?.isXacroFile) {
      return {
        rootTask: "convert",
        command: "xacro-to-urdf",
        label: "xacro",
        key: "xacro",
        slashName: "file",
        value: localPath.inputPath,
      };
    }

    if (localPath) {
      return {
        rootTask: "open",
        command: "load-source",
        label: "open",
        key: "path",
        slashName: localPath.isDirectory ? "local" : "file",
        value: localPath.inputPath,
      };
    }

    return null;
  }

  if (task === "open") {
    if (githubValue) {
      return {
        rootTask: "open",
        command: "load-source",
        label: "open",
        key: "github",
        slashName: "repo",
        value: githubValue,
      };
    }

    if (localPath) {
      return {
        rootTask: "open",
        command: "load-source",
        label: "open",
        key: "path",
        slashName: localPath.isDirectory ? "local" : "file",
        value: localPath.inputPath,
      };
    }
  }

  if (task === "inspect") {
    if (githubValue) {
      return {
        rootTask: "inspect",
        command: "inspect-repo",
        label: "inspect",
        key: "github",
        slashName: "repo",
        value: githubValue,
      };
    }

    if (localPath?.isDirectory) {
      return {
        rootTask: "inspect",
        command: "inspect-repo",
        label: "inspect",
        key: "local",
        slashName: "local",
        value: localPath.inputPath,
      };
    }

    if (localPath?.isUrdfFile) {
      return {
        rootTask: "inspect",
        command: "analyze",
        label: "inspect",
        key: "urdf",
        slashName: "file",
        value: localPath.inputPath,
      };
    }
  }

  if (task === "check" && localPath?.isUrdfFile) {
    return {
      rootTask: "check",
      command: "health-check",
      label: "check",
      key: "urdf",
      slashName: "file",
      value: localPath.inputPath,
    };
  }

  if (task === "convert" && localPath?.isXacroFile) {
    return {
      rootTask: "convert",
      command: "xacro-to-urdf",
      label: "convert",
      key: "xacro",
      slashName: "file",
      value: localPath.inputPath,
    };
  }

  if (task === "fix") {
    if (githubValue) {
      return {
        rootTask: "fix",
        command: "repair-mesh-refs",
        label: "fix",
        key: "github",
        slashName: "repo",
        value: githubValue,
      };
    }

    if (localPath?.isDirectory) {
      return {
        rootTask: "fix",
        command: "repair-mesh-refs",
        label: "fix",
        key: "local",
        slashName: "local",
        value: localPath.inputPath,
      };
    }

    if (localPath?.isUrdfFile) {
      return {
        rootTask: "fix",
        command: "fix-mesh-paths",
        label: "fix",
        key: "urdf",
        slashName: "file",
        value: localPath.inputPath,
      };
    }
  }

  return null;
};

const shouldTreatAsSlashInput = (rawValue: string, state: ShellState): boolean => {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith("/")) {
    return false;
  }

  const parsed = parseSlashInput(trimmed);
  if (parsed && !parsed.inlineValue) {
    if (!parsed.slashCommand) {
      return true;
    }

    const recognizedCommands = listRecognizedSlashCommands(state);
    if (
      recognizedCommands.includes(parsed.slashCommand) ||
      recognizedCommands.some((command) => command.startsWith(parsed.slashCommand))
    ) {
      return true;
    }
  }

  if (looksLikeFilesystemSeed(trimmed)) {
    return false;
  }

  if (detectLocalPathDrop(trimmed)) {
    return false;
  }

  if (state.session?.pending?.expectsPath && looksLikeFilesystemSeed(trimmed)) {
    return false;
  }

  return true;
};

const startRootTaskAction = (
  task: RootTaskName,
  action: RootTaskActionDefinition,
  state: ShellState,
  feedback?: ShellFeedback[]
) => {
  state.rootTask = task;
  clearCandidatePicker(state);
  clearXacroRetry(state);
  state.session = createSession(action.command, state, action.sessionLabel, feedback);
  if (state.session) {
    openPendingForSession(state.session, action.openPending);
  }
};

const startRootShellCommand = (
  entry: RootShellCommandDefinition,
  state: ShellState,
  feedback?: ShellFeedback[]
) => {
  state.rootTask = null;
  clearCandidatePicker(state);
  clearXacroRetry(state);
  state.session = createSession(entry.command, state, entry.sessionLabel, feedback);
  if (state.session) {
    openPendingForSession(state.session, entry.openPending);
  }
};

const handleRootSlashCommand = (
  slashCommand: string,
  state: ShellState,
  close: () => void
) => {
  if (!slashCommand || slashCommand === "help") {
    printRootOptions(state);
    return;
  }

  if (slashCommand === "exit" || slashCommand === "quit") {
    close();
    return;
  }

  if (slashCommand === "clear") {
    console.clear();
    return;
  }

  if (slashCommand === "update") {
    runUpdateCommand();
    return;
  }

  if (slashCommand === "last") {
    printLastUrdf(state);
    return;
  }

  if (slashCommand === "run") {
    process.stdout.write(`${SHELL_THEME.muted(getRootIdleMessage(state))}\n`);
    return;
  }

  const rootShellCommand = getRootShellCommandDefinition(slashCommand);
  if (rootShellCommand) {
    const feedback: ShellFeedback[] = [];
    startRootShellCommand(rootShellCommand, state, feedback);
    flushFeedback(feedback);
    if (state.session && shouldAutoRunSession(state.session)) {
      printSessionCommandExecution(executeSessionCommand(state, state.session), state.session);
      state.session = null;
      state.rootTask = null;
      return;
    }
    if (state.session?.pending) {
      printPendingValuePrompt(state.session.pending);
      return;
    }
    if (state.session) {
      printSessionOptions(state, state.session);
    }
    return;
  }

  if (!(slashCommand in COMMAND_COMPLETION_SPEC_BY_NAME)) {
    process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
    process.stdout.write(`${ROOT_GUIDANCE}\n`);
    return;
  }

  const command = slashCommand as SupportedCommandName;
  const quickSession = tryCreateLoadedRootQuickSession(state, command);
  if (quickSession) {
    clearCandidatePicker(state);
    clearXacroRetry(state);
    printSessionCommandExecution(executeSessionCommand(state, quickSession), quickSession);
    return;
  }

  state.rootTask = null;
  clearCandidatePicker(state);
  clearXacroRetry(state);
  const feedback: ShellFeedback[] = [];
  state.session = createSession(command, state, slashCommand, feedback);
  flushFeedback(feedback);
  printSessionOptions(state, state.session);
};

const handleRootTaskSlashCommand = (
  slashCommand: string,
  state: ShellState,
  close: () => void
) => {
  const task = state.rootTask;
  if (!task) {
    handleRootSlashCommand(slashCommand, state, close);
    return;
  }

  if (!slashCommand || slashCommand === "help") {
    printRootTaskOptions(task);
    return;
  }

  if (slashCommand === "back") {
    clearCandidatePicker(state);
    clearXacroRetry(state);
    state.rootTask = null;
    process.stdout.write(`${SHELL_THEME.muted("back to tasks")}\n`);
    return;
  }

  if (slashCommand === "exit" || slashCommand === "quit") {
    close();
    return;
  }

  if (slashCommand === "clear") {
    console.clear();
    return;
  }

  if (slashCommand === "update") {
    runUpdateCommand();
    return;
  }

  if (slashCommand === "last") {
    printLastUrdf(state);
    return;
  }

  if (slashCommand === "run") {
    process.stdout.write(
      `${SHELL_THEME.muted("nothing is pending here. paste a source or use one of the direct actions")}\n`
    );
    return;
  }

  const action = findRootTaskAction(task, slashCommand);
  if (action) {
    const feedback: ShellFeedback[] = [];
    startRootTaskAction(task, action, state, feedback);
    flushFeedback(feedback);
    if (state.session && shouldAutoRunSession(state.session)) {
      printSessionCommandExecution(executeSessionCommand(state, state.session), state.session);
      state.session = null;
      state.rootTask = null;
      return;
    }
    if (state.session?.pending) {
      printPendingValuePrompt(state.session.pending);
      return;
    }
    if (state.session) {
      printSessionOptions(state, state.session);
      return;
    }
  }

  if (!(slashCommand in COMMAND_COMPLETION_SPEC_BY_NAME)) {
    process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
    return;
  }

  const feedback: ShellFeedback[] = [];
  state.rootTask = null;
  clearCandidatePicker(state);
  clearXacroRetry(state);
  state.session = createSession(slashCommand as SupportedCommandName, state, slashCommand, feedback);
  flushFeedback(feedback);
  printSessionOptions(state, state.session);
};

const handleSessionSlashCommand = (
  slashCommand: string,
  inlineValue: string,
  state: ShellState
) => {
  const session = state.session;
  if (!session) {
    return;
  }

  if (!slashCommand || slashCommand === "help") {
    printSessionOptions(state, session);
    return;
  }

  if (slashCommand === "back") {
    clearCandidatePicker(state);
    clearXacroRetry(state);
    state.session = null;
    process.stdout.write(
      `${SHELL_THEME.muted(state.rootTask ? `back to /${state.rootTask}` : "back to tasks")}\n`
    );
    return;
  }

  if (slashCommand === "reset") {
    const feedback: ShellFeedback[] = [];
    clearCandidatePicker(state);
    clearXacroRetry(state);
    state.session = createSession(session.command, state, session.label, feedback);
    flushFeedback(feedback);
    printSessionOptions(state, state.session);
    return;
  }

  if (slashCommand === "show") {
    printSessionPreview(state, session);
    return;
  }

  if (slashCommand === "run") {
    clearCandidatePicker(state);
    const requirementStatus = getRequirementStatus(session);
    if (!requirementStatus.ready) {
      process.stderr.write(
        `${SHELL_THEME.warning("[missing]")} ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}\n`
      );
      return;
    }

    printSessionCommandExecution(executeSessionCommand(state, session), session);
    return;
  }

  if (slashCommand === "last") {
    printLastUrdf(state);
    return;
  }

  if (slashCommand === "update") {
    runUpdateCommand();
    return;
  }

  if (slashCommand === "clear") {
    console.clear();
    return;
  }

  if (slashCommand === "exit" || slashCommand === "quit") {
    process.exit(0);
  }

  const target = resolveSessionSlashTarget(session, slashCommand);
  if (!target) {
    process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
    return;
  }

  if (!target.option.valueHint) {
    const feedback: ShellFeedback[] = [];
    clearCandidatePicker(state);
    toggleSessionFlag(session, target.key, feedback);
    flushFeedback(feedback);
    printSessionStatus(state, session);
    return;
  }

  if (inlineValue) {
    const feedback: ShellFeedback[] = [];
    if (setSessionValue(session, target.key, inlineValue, feedback)) {
      session.pending = null;
      flushFeedback(feedback);
      const { automation, preview } = applyValueChangeEffects(state, session, target.key);
      if (automation) {
        if (automation.notice) {
          writeFeedback(automation.notice);
        }
        printOutputPanel(automation.panel);
        if (state.candidatePicker) {
          printCandidatePicker(state.candidatePicker);
        }
        if (automation.clearSession) {
          clearCandidatePicker(state);
          state.session = null;
          state.rootTask = null;
        } else if (state.session && !state.candidatePicker) {
          printSessionStatus(state, state.session);
        }
        return;
      }
      printSessionStatus(state, session);
      printOutputPanel(preview);
      if (state.candidatePicker) {
        printCandidatePicker(state.candidatePicker);
      }
      return;
    }
    flushFeedback(feedback);
    return;
  }

  session.pending = getPendingValuePrompt(session, target.key, slashCommand);
  printPendingValuePrompt(session.pending);
};

const handlePendingValue = (input: string, state: ShellState) => {
  const session = state.session;
  if (!session?.pending) {
    return;
  }

  const feedback: ShellFeedback[] = [];
  if (setSessionValue(session, session.pending.key, input, feedback)) {
    const changedKey = session.pending.key;
    session.pending = null;
    flushFeedback(feedback);
    const { automation, preview } = applyValueChangeEffects(state, session, changedKey);
    if (automation) {
      if (automation.notice) {
        writeFeedback(automation.notice);
      }
      printOutputPanel(automation.panel);
      if (state.candidatePicker) {
        printCandidatePicker(state.candidatePicker);
      }
      if (automation.clearSession) {
        clearCandidatePicker(state);
        state.session = null;
        state.rootTask = null;
      } else if (state.session && !state.candidatePicker) {
        printSessionStatus(state, state.session);
      }
      return;
    }
    printSessionStatus(state, session);
    printOutputPanel(preview);
    if (state.candidatePicker) {
      printCandidatePicker(state.candidatePicker);
    }
    return;
  }

  flushFeedback(feedback);
  printPendingValuePrompt(session.pending);
};

const applyFreeformInputToSession = (
  session: ShellSession,
  rawValue: string,
  feedback?: ShellFeedback[]
): AppliedFreeformInput | null => {
  const target = inferFreeformSessionTarget(session, rawValue);
  if (!target) {
    return null;
  }

  if (!setSessionValue(session, target.key, target.value, feedback)) {
    return null;
  }

  return {
    session,
    key: target.key,
  };
};

const applyFreeformInputToRootState = (
  state: ShellState,
  rawValue: string,
  feedback?: ShellFeedback[]
): AppliedFreeformInput | null => {
  const plan = inferFreeformRootPlan(state, rawValue);
  if (!plan) {
    return null;
  }

  state.rootTask = null;
  state.session = createSession(plan.command, state, plan.label, feedback);
  if (!state.session || !setSessionValue(state.session, plan.key, plan.value, feedback)) {
    state.session = null;
    return null;
  }

  return {
    session: state.session,
    key: plan.key,
  };
};

const resolveCandidateSelectionInput = (
  state: ShellState,
  rawValue: string
): string | null => {
  const picker = state.candidatePicker;
  if (!picker) {
    return null;
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return picker.candidates[clamp(picker.selectedIndex, 0, picker.candidates.length - 1)]?.path ?? null;
  }

  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    if (index >= 0 && index < picker.candidates.length) {
      picker.selectedIndex = index;
      return picker.candidates[index]?.path ?? null;
    }
    return null;
  }

  return normalizeShellInput(rawValue);
};

const ROOT_SYSTEM_MENU_ENTRIES = SHELL_BUILTIN_COMMANDS.map((entry) => ({
  ...entry,
  kind: "system" as const,
}));

const SESSION_SYSTEM_MENU_ENTRIES = [
  { name: "last", summary: "Show the last remembered URDF path.", kind: "system" as const },
  { name: "clear", summary: "Clear the current shell view.", kind: "system" as const },
];

const buildRootShellMenuEntries = (
  names: readonly string[]
): readonly TtyMenuEntry[] =>
  names
    .map((name) => getRootShellCommandDefinition(name))
    .filter((entry): entry is RootShellCommandDefinition => Boolean(entry))
    .map((entry) => ({
      name: entry.name,
      summary: entry.summary,
      kind: "flow" as const,
    }));

const START_ROOT_MENU_ENTRIES = buildRootShellMenuEntries(ROOT_START_COMMAND_NAMES);
const LOADED_ROOT_MENU_ENTRIES = buildRootShellMenuEntries(ROOT_READY_COMMAND_NAMES);

const AUTO_RUN_READY_COMMANDS = new Set<SupportedCommandName>([
  "analyze",
  "validate",
  "health-check",
  "guess-orientation",
  "inspect-repo",
]);

const SOURCE_OPTION_KEYS = new Set(["urdf", "local", "github", "xacro", "path"]);

const getLoadedRootCommandList = (): readonly Pick<TtyMenuEntry, "name" | "summary">[] =>
  LOADED_ROOT_MENU_ENTRIES.map(({ name, summary }) => ({ name, summary }));

const getRootTaskMenuEntries = (task: RootTaskName): readonly TtyMenuEntry[] => [
  ...getRootTaskActionDefinitions(task).map((entry) => ({
    name: entry.name,
    summary: entry.summary,
    kind: "action" as const,
  })),
  { name: "back", summary: "Return to the main task menu.", kind: "system" as const },
  { name: "help", summary: "Show the current task options again.", kind: "system" as const },
  ...ROOT_SYSTEM_MENU_ENTRIES.filter((entry) => entry.name !== "help"),
];

const getFullRootMenuEntries = (): readonly TtyMenuEntry[] => {
  const seen = new Set<string>();
  const entries: TtyMenuEntry[] = [];
  const addEntry = (entry: TtyMenuEntry) => {
    if (seen.has(entry.name)) {
      return;
    }
    seen.add(entry.name);
    entries.push(entry);
  };

  for (const entry of START_ROOT_MENU_ENTRIES) {
    addEntry(entry);
  }

  for (const entry of ROOT_SYSTEM_MENU_ENTRIES) {
    addEntry(entry);
  }

  return entries;
};

const getRootMenuEntries = (state: Pick<ShellState, "rootTask" | "lastUrdfPath" | "loadedSource">): readonly TtyMenuEntry[] => {
  if (state.rootTask) {
    return getFullRootMenuEntries();
  }

  if (getReadySourceLabel(state)) {
    const seen = new Set<string>();
    const entries: TtyMenuEntry[] = [];
    const addEntry = (entry: TtyMenuEntry) => {
      if (seen.has(entry.name)) {
        return;
      }
      seen.add(entry.name);
      entries.push(entry);
    };

    for (const entry of LOADED_ROOT_MENU_ENTRIES) {
      addEntry(entry);
    }

    for (const entry of ROOT_SYSTEM_MENU_ENTRIES) {
      addEntry(entry);
    }

    return entries;
  }

  return getFullRootMenuEntries();
};

const getSessionMenuEntries = (session: ShellSession): readonly TtyMenuEntry[] => {
  const entries: TtyMenuEntry[] = shouldSuppressSessionOptionMenu(session)
    ? []
    : getVisibleSessionOptionEntries(session).map((entry) => ({
        name: entry.name,
        summary: entry.summary,
        kind: "option",
      }));

  for (const entry of SESSION_BUILTIN_COMMANDS) {
    entries.push({
      name: entry.name,
      summary: entry.summary,
      kind: "action",
    });
  }

  for (const entry of SESSION_SYSTEM_MENU_ENTRIES) {
    entries.push(entry);
  }

  return entries;
};

const matchMenuEntries = (
  entries: readonly TtyMenuEntry[],
  query: string
): {
  entries: readonly TtyMenuEntry[];
  matchKind: "all" | "startsWith" | "includes" | "none";
} => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { entries, matchKind: "all" };
  }

  const startsWithMatches = entries.filter((entry) => entry.name.startsWith(normalizedQuery));
  if (startsWithMatches.length > 0) {
    return { entries: startsWithMatches, matchKind: "startsWith" };
  }

  const includesMatches = entries.filter((entry) => entry.name.includes(normalizedQuery));
  if (includesMatches.length > 0) {
    return { entries: includesMatches, matchKind: "includes" };
  }

  return { entries, matchKind: "none" };
};

const filterMenuEntries = (entries: readonly TtyMenuEntry[], query: string): readonly TtyMenuEntry[] =>
  matchMenuEntries(entries, query).entries;

const getSlashMenuEntries = (state: ShellState, input: string): readonly TtyMenuEntry[] => {
  if (!shouldTreatAsSlashInput(input.trimStart(), state)) {
    return [];
  }

  const parsed = parseSlashInput(input.trimStart());
  if (!parsed || parsed.inlineValue) {
    return [];
  }

  const primaryEntries = matchMenuEntries(
    state.session ? getSessionMenuEntries(state.session) : getRootMenuEntries(state),
    parsed.slashCommand
  );
  if (
    state.session ||
    state.rootTask ||
    !state.lastUrdfPath ||
    !parsed.slashCommand ||
    primaryEntries.matchKind === "startsWith" ||
    primaryEntries.matchKind === "all"
  ) {
    return primaryEntries.entries;
  }

  const fallbackEntries = matchMenuEntries(getFullRootMenuEntries(), parsed.slashCommand);
  if (fallbackEntries.matchKind === "startsWith") {
    return fallbackEntries.entries;
  }

  return primaryEntries.matchKind !== "none" ? primaryEntries.entries : fallbackEntries.entries;
};

const appendTimelineEntry = (view: TtyShellViewState, entry: ShellTimelineEntry) => {
  view.timeline = [...view.timeline.slice(-11), entry];
};

const pushTimelineUserEntry = (view: TtyShellViewState, text: string) => {
  appendTimelineEntry(view, {
    role: "user",
    lines: [text],
    kind: "info",
  });
};

const compactTimelineLines = (lines: readonly string[], maxLines = 7): readonly string[] => {
  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines), `+${lines.length - maxLines} more`];
};

const buildTimelineResponseLines = (
  notice: ShellFeedback | null,
  panel: ShellOutputPanel,
  fallbackText?: string
): {
  lines: readonly string[];
  kind: ShellFeedbackKind;
} | null => {
  const lines: string[] = [];
  const kind = notice?.kind ?? panel?.kind ?? "info";
  const shouldIncludeNoticeText =
    !panel ||
    !notice?.text ||
    !new Set(["run complete", "preview ready", "health preview ready", "showing the current context"]).has(notice.text);
  const panelNarrative =
    panel?.title === "loaded"
      ? "loaded the source"
      : panel?.title === "checks"
        ? "checked the source"
        : panel?.title === "investigation"
          ? "investigated the source"
          : panel?.title === "validation"
            ? "validated the URDF"
            : panel?.title === "orientation"
              ? "estimated orientation"
              : panel?.title === "preview"
                ? "previewed the source"
                : panel?.title === "context"
                  ? "current context"
                  : panel?.title === "xacro"
                    ? "xacro runtime"
                    : null;

  if (panelNarrative) {
    lines.push(panelNarrative);
  }

  if (notice?.text && shouldIncludeNoticeText) {
    lines.push(notice.text);
  }

  if (panel) {
    for (const line of panel.lines) {
      if (!notice?.text || line !== notice.text) {
        lines.push(line);
      }
    }
  }

  if (lines.length === 0 && fallbackText) {
    lines.push(...fallbackText.split(/\r?\n/).filter((line) => line.trim().length > 0));
  }

  if (lines.length === 0) {
    return null;
  }

  return {
    lines: compactTimelineLines(lines),
    kind,
  };
};

const pushTimelineAssistantEntry = (
  view: TtyShellViewState,
  lines: readonly string[],
  kind: ShellFeedbackKind = "info"
) => {
  if (lines.length === 0) {
    return;
  }

  appendTimelineEntry(view, {
    role: "assistant",
    lines: compactTimelineLines(lines),
    kind,
  });
};

const archiveAssistantStateToTimeline = (
  view: TtyShellViewState,
  options: {
    clear?: boolean;
    fallbackText?: string;
  } = {}
) => {
  const built = buildTimelineResponseLines(view.notice, view.output, options.fallbackText);
  if (built) {
    pushTimelineAssistantEntry(view, built.lines, built.kind);
  }
  if (options.clear !== false) {
    view.notice = null;
    view.output = null;
  }
};

const setNoticeFromFeedback = (view: TtyShellViewState, feedback: readonly ShellFeedback[]) => {
  if (feedback.length === 0) {
    view.notice = null;
    return;
  }

  view.notice = {
    kind: feedback[feedback.length - 1]?.kind ?? "info",
    text: feedback.map((entry) => entry.text).join("  "),
  };
};

const truncateText = (value: string, width: number): string => {
  if (width <= 0) {
    return "";
  }
  if (value.length <= width) {
    return value;
  }
  if (width <= 3) {
    return value.slice(0, width);
  }
  return `${value.slice(0, width - 3)}...`;
};

const getMenuWindow = (
  entries: readonly TtyMenuEntry[],
  selectedIndex: number,
  maxVisible: number
): {
  selectedIndex: number;
  start: number;
  visible: readonly TtyMenuEntry[];
} => {
  if (entries.length === 0) {
    return { selectedIndex: 0, start: 0, visible: [] };
  }

  const normalizedSelectedIndex = clamp(selectedIndex, 0, entries.length - 1);
  const visibleCount = clamp(maxVisible, 1, entries.length);
  const start = clamp(
    normalizedSelectedIndex - Math.floor(visibleCount / 2),
    0,
    Math.max(entries.length - visibleCount, 0)
  );

  return {
    selectedIndex: normalizedSelectedIndex,
    start,
    visible: entries.slice(start, start + visibleCount),
  };
};

const buildSessionPreviewText = (
  state: Pick<ShellState, "loadedSource" | "lastUrdfPath">,
  session: ShellSession
): string => {
  const lines = getSessionContextRows(state, session).map((row) => `${row.label} ${row.value}`);
  lines.push("");
  lines.push(`command ${buildCommandPreview(session.command, session.args)}`);
  if (session.args.size > 0) {
    for (const [key, value] of session.args.entries()) {
      lines.push(`${getSlashDisplayName(session, key)}${formatInlineValue(value === true ? "enabled" : String(value))}`);
    }
  }
  return lines.join("\n");
};

const buildExecutionPanelText = (
  execution: ReturnType<typeof executeSessionCommand>,
  command: SupportedCommandName
): string => {
  const chunks = [execution.preview];
  if (execution.stdout.trim().length > 0) {
    chunks.push(execution.stdout.trimEnd());
  }
  if (execution.stderr.trim().length > 0) {
    chunks.push(execution.stderr.trimEnd());
  }
  if (execution.status !== 0) {
    chunks.push(`[${command}] exited with status ${execution.status}`);
  }
  if (execution.followUp) {
    chunks.push(execution.followUp);
  }
  return chunks.join("\n");
};

const renderNotice = (notice: ShellFeedback): string => {
  const text = notice.text;
  switch (notice.kind) {
    case "success":
      return SHELL_THEME.success(text);
    case "warning":
      return SHELL_THEME.warning(text);
    case "error":
      return SHELL_THEME.error(text);
    case "info":
      return SHELL_THEME.muted(text);
  }
};

const renderTimelineEntryLine = (
  entry: ShellTimelineEntry,
  line: string,
  first: boolean
): string => {
  if (entry.role === "user") {
    return `  ${SHELL_THEME.command(">")} ${SHELL_THEME.command(line)}`;
  }

  const icon = first ? getPanelLineIcon(line) : "·";
  const text =
    entry.kind === "error"
      ? SHELL_THEME.error(line)
      : entry.kind === "warning"
        ? SHELL_THEME.warning(line)
        : entry.kind === "success" && first
          ? SHELL_THEME.success(line)
          : SHELL_THEME.muted(line);

  return `  ${SHELL_THEME.icon(icon)} ${text}`;
};

const shouldRenderInlineNotice = (view: TtyShellViewState): boolean => {
  if (!view.notice) {
    return false;
  }

  if (view.busy && view.notice.kind === "info") {
    return false;
  }

  if (view.timeline.length > 0 && view.notice.kind === "info") {
    return false;
  }

  return true;
};

const renderMenuEntry = (
  entry: TtyMenuEntry,
  selected: boolean,
  width: number
): string => {
  const badge =
    entry.kind === "task"
      ? "top"
      : entry.kind === "flow"
        ? "cmd"
        : entry.kind === "option"
          ? "set"
          : entry.kind === "action"
            ? "act"
            : "";
  const label = `/${entry.name}`;
  const left = `${selected ? ">" : " "} ${truncateText(label, 24).padEnd(24)} `;
  const badgeSuffix = badge ? ` ${badge}` : "";
  const availableSummaryWidth = Math.max(12, width - left.length - badgeSuffix.length - 1);
  const summary = truncateText(entry.summary, availableSummaryWidth);
  const line = `${left}${summary}${badgeSuffix}`;
  return selected ? SHELL_THEME.selected(line) : `${SHELL_THEME.command(left)}${SHELL_THEME.muted(`${summary}${badgeSuffix}`)}`;
};

const getPromptPlaceholder = (state: ShellState): string => {
  if (state.candidatePicker) {
    return "arrows choose a match, Enter loads it";
  }

  if (state.session?.pending) {
    return state.session.pending.examples[0] ?? state.session.pending.title;
  }

  if (state.session?.label === "open" && state.session.args.size === 0) {
    return "paste owner/repo or drop a local folder/file";
  }

  if (state.session?.label === "inspect" && state.session.args.size === 0) {
    return "paste owner/repo or drop a local folder";
  }

  if (!state.session && state.rootTask) {
    switch (state.rootTask) {
      case "open":
        return "paste owner/repo or drop a local folder, .urdf, .xacro, or .zip";
      case "inspect":
        return "paste owner/repo or drop a local folder or .urdf";
      case "check":
        return "drop a local .urdf or use /health /validate /orientation";
      case "convert":
        return "drop a local .xacro or use /xacro /mjcf /usd";
      case "fix":
        return "paste owner/repo or drop a local folder or .urdf";
    }
  }

  if (!state.session) {
    if (state.lastUrdfPath) {
      return "use /analyze /health /validate /orientation or paste another source";
    }
    return "paste owner/repo, drop a folder or .urdf, or type /";
  }

  const requirementStatus = getRequirementStatus(state.session);
  if (requirementStatus.ready) {
    return "press Enter to run";
  }

  return `set ${requirementStatus.nextSteps
    .map((step) => formatSlashSequence(state.session as ShellSession, step))
    .join(" or ")}`;
};

const renderTtyShell = (state: ShellState, view: TtyShellViewState) => {
  const columns = process.stdout.columns ?? 100;
  const rows = process.stdout.rows ?? 24;
  const menuEntries = getSlashMenuEntries(state, view.input);
  const menuWindow = getMenuWindow(menuEntries, view.menuIndex, Math.max(4, Math.min(8, rows - 16)));
  view.menuIndex = menuWindow.selectedIndex;

  const lines: string[] = [];
  lines.push(`${SHELL_THEME.brand(SHELL_BRAND)} ${SHELL_THEME.muted("ilu interactive urdf shell")}`);
  lines.push(SHELL_THEME.muted("paste owner/repo or drop a local path  / shows actions  !xacro sets up xacro  ctrl+c exits"));
  if (state.candidatePicker && state.session) {
    const selectedCandidate =
      state.candidatePicker.candidates[clamp(state.candidatePicker.selectedIndex, 0, state.candidatePicker.candidates.length - 1)];
    const rows = getSessionContextRows(state, state.session).filter((row) => row.label !== "next");
    rows.push({
      label: "selected",
      value: selectedCandidate?.path ?? "none yet",
    });
    rows.push({
      label: "next",
      value: "use up/down, then press Enter to load the highlighted entry",
      tone: "accent",
    });
    for (const row of rows) {
      lines.push(renderContextRow(row));
    }
    if (selectedCandidate) {
      const selectedDetails = getCandidateDetails(selectedCandidate);
      if (selectedDetails.length > 0) {
        lines.push(`  ${SHELL_THEME.muted("details".padEnd(12))} ${SHELL_THEME.muted(selectedDetails.join("  "))}`);
      }
    }
  } else if (state.session) {
    for (const row of getSessionContextRows(state, state.session)) {
      lines.push(renderContextRow(row));
    }
  } else if (state.rootTask) {
    lines.push(renderContextRow({ label: "source", value: "none yet", tone: "muted" }));
    lines.push(renderContextRow({ label: "action", value: getRootTaskSummary(state.rootTask), tone: "muted" }));
    lines.push(renderContextRow({ label: "next", value: "paste input directly or type /", tone: "accent" }));
  } else {
    for (const row of getLoadedSourceContextRows(state)) {
      lines.push(renderContextRow(row));
    }
    if (!getReadySourceLabel(state)) {
      lines.push(renderContextRow({ label: "help", value: "/ shows direct actions when you need them", tone: "muted" }));
    }
  }

  if (view.timeline.length > 0) {
    for (const entry of view.timeline.slice(-8)) {
      for (const [index, line] of entry.lines.entries()) {
        lines.push(renderTimelineEntryLine(entry, truncateText(line, columns - 6), index === 0));
      }
    }
  }

  if (view.busy) {
    lines.push(`  ${SHELL_THEME.icon("…")} ${SHELL_THEME.muted(`${view.busy.title}  ${view.busy.lines.join("  ")}`)}`);
  }

  if (shouldRenderInlineNotice(view)) {
    lines.push(`  ${renderNotice(view.notice)}`);
  }

  const promptLabel = formatShellPrompt(state).trimEnd();
  const promptLineIndex = lines.length;
  const shouldShowPlaceholder =
    view.input.length === 0 &&
    !view.busy &&
    (view.timeline.length === 0 || Boolean(state.session) || Boolean(state.candidatePicker));
  const placeholder = shouldShowPlaceholder ? getPromptPlaceholder(state) : "";
  lines.push(
    `${SHELL_THEME.command(promptLabel)} ${view.input}${
      view.busy ? SHELL_THEME.muted("working...") : placeholder ? SHELL_THEME.muted(placeholder) : ""
    }`
  );

  if (state.session?.pending && !view.input.startsWith("/")) {
    const hasExamples = state.session.pending.examples.length > 0;
    const hasNotes = state.session.pending.notes.length > 0;
    if (hasExamples) {
      lines.push(SHELL_THEME.section("examples"));
      for (const example of state.session.pending.examples.slice(0, 2)) {
        lines.push(`  ${SHELL_THEME.muted(example)}`);
      }
    }
    if (hasNotes) {
      lines.push(SHELL_THEME.section("note"));
      for (const note of state.session.pending.notes) {
        lines.push(`  ${SHELL_THEME.warning(truncateText(note, columns - 4))}`);
      }
    }
  } else if (state.candidatePicker && !view.input.startsWith("/")) {
    lines.push(SHELL_THEME.section("picker"));
    for (const [index, candidate] of state.candidatePicker.candidates.slice(0, 8).entries()) {
      const details = getCandidateDetails(candidate);
      const line = `${candidate.path}${details.length > 0 ? `  ${details.join("  ")}` : ""}`;
      const selected = index === state.candidatePicker.selectedIndex;
      lines.push(
        selected
          ? `  ${SHELL_THEME.selected(` ${truncateText(line, columns - 6)} `)}`
          : `  ${SHELL_THEME.command(candidate.path)}${details.length > 0 ? `  ${SHELL_THEME.muted(truncateText(details.join("  "), columns - candidate.path.length - 8))}` : ""}`
      );
    }
    if (state.candidatePicker.candidates.length > 8) {
      lines.push(`  ${SHELL_THEME.muted("...")}`);
    }
  } else if (shouldTreatAsSlashInput(view.input, state)) {
    lines.push(SHELL_THEME.section("picker"));
    if (menuEntries.length === 0) {
      lines.push(`  ${SHELL_THEME.warning("no matches")}`);
    } else {
      if (menuWindow.start > 0) {
        lines.push(`  ${SHELL_THEME.muted("...")}`);
      }
      for (const [index, entry] of menuWindow.visible.entries()) {
        lines.push(renderMenuEntry(entry, menuWindow.start + index === menuWindow.selectedIndex, columns - 2));
      }
      if (menuWindow.start + menuWindow.visible.length < menuEntries.length) {
        lines.push(`  ${SHELL_THEME.muted("...")}`);
      }
    }
  }

  process.stdout.write("\u001b[H\u001b[J");
  process.stdout.write(lines.join("\n"));

  const linesBelowPrompt = lines.length - promptLineIndex - 1;
  if (linesBelowPrompt > 0) {
    process.stdout.write(`\u001b[${linesBelowPrompt}A`);
  }
  process.stdout.write("\r");
  process.stdout.write(`\u001b[${stripAnsi(`${promptLabel} ${view.input}`).length}C`);
};

const completeTtyPathInput = (
  input: string,
  state: ShellState
): {
  nextInput: string;
  notice: ShellFeedback | null;
} | null => {
  if (state.session?.pending && state.session.pending.expectsPath) {
    const matches = completePathFragment(normalizeFilesystemInput(input));
    if (matches.length === 1) {
      return { nextInput: matches[0] ?? input, notice: null };
    }
    if (matches.length > 1) {
      return {
        nextInput: input,
        notice: { kind: "info", text: matches.slice(0, 3).join("  ") },
      };
    }
  }

  if (!state.session?.pending && looksLikeFilesystemSeed(input)) {
    const matches = completePathFragment(normalizeFilesystemInput(input));
    if (matches.length === 1) {
      return { nextInput: matches[0] ?? input, notice: null };
    }
    if (matches.length > 1) {
      return {
        nextInput: input,
        notice: { kind: "info", text: matches.slice(0, 3).join("  ") },
      };
    }
  }

  const parsed = parseSlashInput(input);
  if (!parsed?.inlineValue || !state.session) {
    return null;
  }

  const target = resolveSessionSlashTarget(state.session, parsed.slashCommand);
  if (!target || target.key === "github" || !isPathLikeOption(state.session, target.key)) {
    return null;
  }

  const matches = completePathFragment(parsed.inlineValue);
  if (matches.length === 1) {
    return {
      nextInput: `/${parsed.slashCommand} ${matches[0]}`,
      notice: null,
    };
  }
  if (matches.length > 1) {
    return {
      nextInput: input,
      notice: { kind: "info", text: matches.slice(0, 3).map((match) => `/${parsed.slashCommand} ${match}`).join("  ") },
    };
  }
  return null;
};

const completeSelectedSlashInput = (
  input: string,
  state: ShellState,
  selectedIndex: number
): string | null => {
  const parsed = parseSlashInput(input);
  if (!parsed || parsed.inlineValue) {
    return null;
  }

  const menuEntries = getSlashMenuEntries(state, input);
  if (menuEntries.length === 0) {
    return null;
  }

  const selected = menuEntries[clamp(selectedIndex, 0, menuEntries.length - 1)];
  return selected ? `/${selected.name}` : null;
};

const runLineInteractiveShell = async (options: ShellOptions = {}) => {
  const state: ShellState = {
    session: null,
    rootTask: null,
    candidatePicker: null,
    xacroRetry: null,
    loadedSource: null,
  };
  let isClosed = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true && process.stdout.isTTY === true,
    completer: createCompleter(state),
  });
  rl.on("close", () => {
    isClosed = true;
  });
  rl.on("SIGINT", () => {
    process.stdout.write("\n");
    rl.close();
  });

  const close = () => rl.close();

  printRootQuickStart();

  if (options.initialSlashCommand) {
    const parsed = parseSlashInput(options.initialSlashCommand);
    if (parsed) {
      handleRootSlashCommand(parsed.slashCommand, state, close);
    }
  }

  rl.setPrompt(formatShellPrompt(state));
  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    const session = state.session;
    const isSlashInput = shouldTreatAsSlashInput(line, state);
    const bangCommand = parseBangInput(line);

    if (bangCommand) {
      if (bangCommand === "xacro") {
        process.stdout.write(`${SHELL_THEME.muted("setting up xacro runtime...")}\n`);
        const result = runXacroBangCommand(state);
        writeFeedback(result.notice);
        printOutputPanel(result.panel);
        if (result.clearSession) {
          state.session = null;
          state.rootTask = null;
        }
      }
    } else if (state.candidatePicker && !isSlashInput) {
      const selectedPath = resolveCandidateSelectionInput(state, line);
      if (selectedPath) {
        const result = runSelectedCandidatePicker(state, selectedPath);
        if (result?.notice) {
          writeFeedback(result.notice);
        }
        printOutputPanel(result?.panel ?? null);
        if (result?.clearSession) {
          clearCandidatePicker(state);
          state.session = null;
          state.rootTask = null;
        }
      } else {
        process.stdout.write(`${SHELL_THEME.warning("pick a valid number or paste a repo entry path")}\n`);
        if (state.candidatePicker) {
          printCandidatePicker(state.candidatePicker);
        }
      }
    } else if (session?.pending && !isSlashInput) {
      handlePendingValue(line, state);
    } else if (isSlashInput) {
      const parsed = parseSlashInput(trimmed);
      if (parsed) {
        if (session) {
          handleSessionSlashCommand(parsed.slashCommand, parsed.inlineValue, state);
        } else if (state.rootTask) {
          handleRootTaskSlashCommand(parsed.slashCommand, state, close);
        } else {
          handleRootSlashCommand(parsed.slashCommand, state, close);
        }
      }
    } else if (!trimmed) {
      if (session) {
        if (!session.pending && getRequirementStatus(session).ready) {
          printSessionCommandExecution(executeSessionCommand(state, session), session);
        } else {
          printSessionStatus(state, session);
        }
      } else if (state.rootTask) {
        printRootTaskOptions(state.rootTask);
      } else {
        printRootOptions(state);
      }
    } else if (session) {
      const feedback: ShellFeedback[] = [];
      const applied = applyFreeformInputToSession(session, line, feedback);
      if (applied) {
        const automated = runDirectInputAutomation(state, applied.session, applied.key);
        if (automated) {
          if (automated.notice) {
            writeFeedback(automated.notice);
          }
          printOutputPanel(automated.panel);
          if (state.candidatePicker) {
            printCandidatePicker(state.candidatePicker);
          }
          if (automated.clearSession) {
            clearCandidatePicker(state);
            state.session = null;
            state.rootTask = null;
          } else if (state.session) {
            if (!state.candidatePicker) {
              printSessionStatus(state, state.session);
            }
          }
        } else {
          printSessionStatus(state, session);
          printOutputPanel(buildAutoPreviewPanel(state, applied.session, applied.key));
          if (state.candidatePicker) {
            printCandidatePicker(state.candidatePicker);
          }
        }
      } else {
        flushFeedback(feedback);
        process.stdout.write(`${SHELL_THEME.muted("type /, drop a local path, or paste owner/repo")}\n`);
      }
    } else {
      const feedback: ShellFeedback[] = [];
      const applied = applyFreeformInputToRootState(state, line, feedback);
      if (applied && state.session) {
        const automated = runDirectInputAutomation(state, applied.session, applied.key);
        if (automated) {
          if (automated.notice) {
            writeFeedback(automated.notice);
          }
          printOutputPanel(automated.panel);
          if (state.candidatePicker) {
            printCandidatePicker(state.candidatePicker);
          }
          if (automated.clearSession) {
            clearCandidatePicker(state);
            state.session = null;
            state.rootTask = null;
          } else if (state.session) {
            if (!state.candidatePicker) {
              printSessionStatus(state, state.session);
            }
          }
        } else {
          printSessionStatus(state, state.session);
          printOutputPanel(buildAutoPreviewPanel(state, applied.session, applied.key));
          if (state.candidatePicker) {
            printCandidatePicker(state.candidatePicker);
          }
        }
      } else {
        flushFeedback(feedback);
        process.stdout.write(`${SHELL_THEME.muted("type /, drop a local path, or paste owner/repo")}\n`);
      }
    }

    if (isClosed) {
      break;
    }

    rl.setPrompt(formatShellPrompt(state));
    rl.prompt();
  }
};

const runTtyInteractiveShell = async (options: ShellOptions = {}) => {
  const state: ShellState = {
    session: null,
    rootTask: null,
    candidatePicker: null,
    xacroRetry: null,
    loadedSource: null,
  };
  const view: TtyShellViewState = {
    input: "",
    timeline: [],
    menuIndex: 0,
    notice: null,
    output: null,
    busy: null,
  };
  let closed = false;
  let ignoreKeypressUntilMs = 0;

  const close = () => {
    closed = true;
  };

  const setInput = (nextInput: string) => {
    view.input = nextInput;
    const menuEntries = getSlashMenuEntries(state, view.input);
    view.menuIndex = menuEntries.length === 0 ? 0 : clamp(view.menuIndex, 0, menuEntries.length - 1);
  };

  const openSession = (command: SupportedCommandName) => {
    const feedback: ShellFeedback[] = [];
    state.rootTask = null;
    clearCandidatePicker(state);
    clearXacroRetry(state);
    state.session = createSession(command, state, command, feedback);
    setNoticeFromFeedback(view, feedback);
    setInput(state.session?.pending ? "" : "/");
    pushTimelineUserEntry(view, `/${command}`);
    if (state.session) {
      pushTimelineAssistantEntry(view, buildSessionNarrativeLines(state, state.session), "info");
      view.notice = null;
    }
  };

  const openRootTask = (task: RootTaskName) => {
    state.rootTask = task;
    state.session = null;
    clearCandidatePicker(state);
    clearXacroRetry(state);
    setInput("/");
    view.notice = { kind: "info", text: `${getRootTaskSummary(task)}  choose below or paste input directly` };
    pushTimelineUserEntry(view, `/${task}`);
    pushTimelineAssistantEntry(view, [`action ${getRootTaskSummary(task)}`, "next paste input directly or type /"], "info");
    view.notice = null;
  };

  const getBusyStateForSession = (
    session: ShellSession,
    changedKey?: string
  ): {
    title: string;
    lines: readonly string[];
  } => {
    if (session.command === "load-source") {
      if (
        changedKey === "github" ||
        (typeof session.args.get("github") === "string" && String(session.args.get("github")).trim().length > 0)
      ) {
        return {
          title: "loading",
          lines: ["reading repository...", "finding URDF entrypoints..."],
        };
      }

      const sourcePath = session.args.get("path");
      if (typeof sourcePath === "string" && sourcePath.toLowerCase().endsWith(".zip")) {
        return {
          title: "loading",
          lines: ["opening archive...", "finding URDF entrypoints..."],
        };
      }

      return {
        title: "loading",
        lines: ["reading local source...", "finding URDF entrypoints..."],
      };
    }

    if (session.command === "health-check") {
      return {
        title: "checking",
        lines: ["running validation...", "running health check..."],
      };
    }

    if (session.command === "analyze") {
      return {
        title: "investigating",
        lines: ["running validation...", "checking health...", "reading structure...", "guessing orientation..."],
      };
    }

    if (session.command === "xacro-to-urdf") {
      return {
        title: "xacro",
        lines: ["expanding xacro...", "building URDF output..."],
      };
    }

    return {
      title: "working",
      lines: ["running command..."],
      };
  };

  const syncInputAfterSlashAction = (parsed: { slashCommand: string; inlineValue: string }) => {
    if (state.candidatePicker || state.session?.pending) {
      setInput("");
      return;
    }

    if (!parsed.inlineValue && (!parsed.slashCommand || parsed.slashCommand === "help")) {
      setInput("/");
      return;
    }

    if (state.session) {
      setInput(shouldSuppressSessionOptionMenu(state.session) ? "" : "/");
      return;
    }

    if (state.rootTask) {
      setInput("/");
      return;
    }

    setInput("");
  };

  const handleRootAction = (slashCommand: string): boolean => {
    if (!slashCommand || slashCommand === "help") {
      setInput("/");
      return true;
    }

    if (slashCommand === "exit" || slashCommand === "quit") {
      close();
      return true;
    }

    if (slashCommand === "clear") {
      view.timeline = [];
      view.notice = null;
      view.output = null;
      return true;
    }

    if (slashCommand === "last") {
      view.notice = { kind: "info", text: getLastUrdfMessage(state) };
      pushTimelineUserEntry(view, "/last");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "run") {
      clearCandidatePicker(state);
      view.notice = {
        kind: "info",
        text: getRootIdleMessage(state),
      };
      pushTimelineUserEntry(view, "/run");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "update") {
      try {
        runUpdateCommand();
        view.notice = { kind: "success", text: "ilu is up to date." };
      } catch (error) {
        view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
      }
      pushTimelineUserEntry(view, "/update");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    const rootShellCommand = getRootShellCommandDefinition(slashCommand);
    if (rootShellCommand) {
      const feedback: ShellFeedback[] = [];
      startRootShellCommand(rootShellCommand, state, feedback);
      setNoticeFromFeedback(view, feedback);
      if (state.session && shouldAutoRunSession(state.session)) {
        const execution = runBusyOperation(getBusyStateForSession(state.session), () =>
          executeSessionCommand(state, state.session as ShellSession)
        );
        const compactFailurePanel =
          execution.status !== 0 ? getShellExecutionFailurePanel(execution, state.session.command) : null;
        if (compactFailurePanel) {
          view.output = compactFailurePanel;
          view.notice = buildShellFailureNotice(
            compactFailurePanel,
            `[${state.session.command}] exited with status ${execution.status}`
          );
        } else {
          const successPanel = getShellExecutionSuccessPanel(state.session, execution);
          view.output =
            successPanel ??
            createOutputPanel(
              execution.status === 0 ? "result" : "error",
              buildExecutionPanelText(execution, state.session.command),
              execution.status === 0 ? "success" : "error"
            );
          view.notice =
            execution.status === 0
              ? { kind: "success", text: "run complete" }
              : { kind: "error", text: `[${state.session.command}] exited with status ${execution.status}` };
        }
        state.session = null;
        state.rootTask = null;
      } else if (state.session?.pending) {
        view.notice = {
          kind: state.session.pending.notes.length > 0 ? "warning" : "info",
          text: [
            state.session.pending.examples[0] !== undefined
              ? `${state.session.pending.title}: ${state.session.pending.examples[0]}`
              : state.session.pending.title,
            ...state.session.pending.notes,
          ].join("  "),
        };
      }
      pushTimelineUserEntry(view, `/${slashCommand}`);
      if (view.output || view.notice) {
        archiveAssistantStateToTimeline(view, {
          clear: true,
          fallbackText: state.session ? buildSessionNarrativeLines(state, state.session).join("\n") : undefined,
        });
      }
      if (state.session) {
        pushTimelineAssistantEntry(view, buildSessionNarrativeLines(state, state.session), "info");
      }
      return true;
    }

    if (!(slashCommand in COMMAND_COMPLETION_SPEC_BY_NAME)) {
      view.notice = { kind: "error", text: `Unknown slash command: /${slashCommand}` };
      return true;
    }

    const command = slashCommand as SupportedCommandName;
    const quickSession = tryCreateLoadedRootQuickSession(state, command);
    if (quickSession) {
      clearCandidatePicker(state);
      clearXacroRetry(state);
      const execution = runBusyOperation(getBusyStateForSession(quickSession), () =>
        executeSessionCommand(state, quickSession)
      );
      const compactFailurePanel =
        execution.status !== 0 ? getShellExecutionFailurePanel(execution, quickSession.command) : null;
      if (compactFailurePanel) {
        view.output = compactFailurePanel;
        view.notice = buildShellFailureNotice(
          compactFailurePanel,
          `[${quickSession.command}] exited with status ${execution.status}`
        );
      } else {
        const successPanel = getShellExecutionSuccessPanel(quickSession, execution);
        view.output =
          successPanel ??
          createOutputPanel(
            execution.status === 0 ? "result" : "error",
            buildExecutionPanelText(execution, quickSession.command),
            execution.status === 0 ? "success" : "error"
          );
        view.notice =
          execution.status === 0
            ? { kind: "success", text: "run complete" }
            : { kind: "error", text: `[${quickSession.command}] exited with status ${execution.status}` };
      }
      pushTimelineUserEntry(view, `/${slashCommand}`);
      archiveAssistantStateToTimeline(view);
      return true;
    }

    openSession(command);
    return true;
  };

  const handleRootTaskAction = (slashCommand: string): boolean => {
    const task = state.rootTask;
    if (!task) {
      return handleRootAction(slashCommand);
    }

    if (!slashCommand || slashCommand === "help") {
      setInput("/");
      return true;
    }

    if (slashCommand === "back") {
      state.rootTask = null;
      clearCandidatePicker(state);
      clearXacroRetry(state);
      view.notice = { kind: "info", text: "back to tasks" };
      pushTimelineUserEntry(view, "/back");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "exit" || slashCommand === "quit") {
      close();
      return true;
    }

    if (slashCommand === "clear") {
      view.timeline = [];
      view.notice = null;
      view.output = null;
      return true;
    }

    if (slashCommand === "last") {
      view.notice = { kind: "info", text: getLastUrdfMessage(state) };
      pushTimelineUserEntry(view, "/last");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "run") {
      clearCandidatePicker(state);
      view.notice = {
        kind: "info",
        text: "nothing is pending here. paste a source or choose one of the direct actions",
      };
      pushTimelineUserEntry(view, "/run");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "update") {
      try {
        runUpdateCommand();
        view.notice = { kind: "success", text: "ilu is up to date." };
      } catch (error) {
        view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
      }
      pushTimelineUserEntry(view, "/update");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (ROOT_TASKS.some((entry) => entry.name === slashCommand)) {
      openRootTask(slashCommand as RootTaskName);
      return true;
    }

    const action = findRootTaskAction(task, slashCommand);
    if (action) {
      const feedback: ShellFeedback[] = [];
      startRootTaskAction(task, action, state, feedback);
      setNoticeFromFeedback(view, feedback);
      if (state.session && shouldAutoRunSession(state.session)) {
        const execution = runBusyOperation(getBusyStateForSession(state.session), () =>
          executeSessionCommand(state, state.session as ShellSession)
        );
        const compactFailurePanel =
          execution.status !== 0 ? getShellExecutionFailurePanel(execution, state.session.command) : null;
        if (compactFailurePanel) {
          view.output = compactFailurePanel;
          view.notice = buildShellFailureNotice(
            compactFailurePanel,
            `[${state.session.command}] exited with status ${execution.status}`
          );
        } else {
          const successPanel = getShellExecutionSuccessPanel(state.session, execution);
          view.output =
            successPanel ??
            createOutputPanel(
              execution.status === 0 ? "result" : "error",
              buildExecutionPanelText(execution, state.session.command),
              execution.status === 0 ? "success" : "error"
            );
          view.notice =
            execution.status === 0
              ? { kind: "success", text: "run complete" }
              : { kind: "error", text: `[${state.session.command}] exited with status ${execution.status}` };
        }
        state.session = null;
        state.rootTask = null;
        pushTimelineUserEntry(view, `/${slashCommand}`);
        archiveAssistantStateToTimeline(view);
        return true;
      }
      if (state.session?.pending) {
        view.notice = {
          kind: state.session.pending.notes.length > 0 ? "warning" : "info",
          text: [
            state.session.pending.examples[0] !== undefined
              ? `${state.session.pending.title}: ${state.session.pending.examples[0]}`
              : state.session.pending.title,
            ...state.session.pending.notes,
          ].join("  "),
        };
      }
      pushTimelineUserEntry(view, `/${slashCommand}`);
      if (view.output || view.notice) {
        archiveAssistantStateToTimeline(view);
      }
      if (state.session) {
        pushTimelineAssistantEntry(view, buildSessionNarrativeLines(state, state.session), "info");
      }
      return true;
    }

    if (!(slashCommand in COMMAND_COMPLETION_SPEC_BY_NAME)) {
      view.notice = { kind: "error", text: `Unknown slash command: /${slashCommand}` };
      return true;
    }

    openSession(slashCommand as SupportedCommandName);
    return true;
  };

  const handleSessionAction = (slashCommand: string, inlineValue: string): boolean => {
    const session = state.session;
    if (!session) {
      return false;
    }

    if (!slashCommand || slashCommand === "help") {
      setInput("/");
      return true;
    }

    if (slashCommand === "back") {
      clearCandidatePicker(state);
      clearXacroRetry(state);
      state.session = null;
      view.notice = { kind: "info", text: state.rootTask ? `back to /${state.rootTask}` : "back to tasks" };
      setInput(state.rootTask ? "/" : "");
      pushTimelineUserEntry(view, "/back");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "reset") {
      const feedback: ShellFeedback[] = [];
      clearCandidatePicker(state);
      clearXacroRetry(state);
      state.session = createSession(session.command, state, session.label, feedback);
      setNoticeFromFeedback(view, feedback);
      setInput(state.session?.pending ? "" : "/");
      pushTimelineUserEntry(view, "/reset");
      if (state.session) {
        pushTimelineAssistantEntry(view, buildSessionNarrativeLines(state, state.session), "info");
      }
      view.notice = null;
      return true;
    }

    if (slashCommand === "show") {
      view.output = createOutputPanel("context", buildSessionPreviewText(state, session));
      view.notice = { kind: "info", text: "showing the current context" };
      pushTimelineUserEntry(view, "/show");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "run") {
      clearCandidatePicker(state);
      const requirementStatus = getRequirementStatus(session);
      if (!requirementStatus.ready) {
        view.notice = {
          kind: "error",
          text: `[missing] ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}`,
        };
        pushTimelineUserEntry(view, "/run");
        archiveAssistantStateToTimeline(view);
        return true;
      }

      const execution = runBusyOperation(getBusyStateForSession(session), () =>
        executeSessionCommand(state, session)
      );
      const compactFailurePanel = execution.status !== 0 ? getShellExecutionFailurePanel(execution, session.command) : null;
      if (compactFailurePanel) {
        view.output = compactFailurePanel;
        view.notice = buildShellFailureNotice(
          compactFailurePanel,
          `[${session.command}] exited with status ${execution.status}`
        );
        pushTimelineUserEntry(view, "/run");
        archiveAssistantStateToTimeline(view);
        return true;
      }

      const successPanel = getShellExecutionSuccessPanel(session, execution);
      view.output =
        successPanel ??
        createOutputPanel(
          execution.status === 0 ? "result" : "error",
          buildExecutionPanelText(execution, session.command),
          execution.status === 0 ? "success" : "error"
        );
      view.notice =
        execution.status === 0
          ? { kind: "success", text: "run complete" }
          : { kind: "error", text: `[${session.command}] exited with status ${execution.status}` };
      pushTimelineUserEntry(view, "/run");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "last") {
      view.notice = { kind: "info", text: getLastUrdfMessage(state) };
      pushTimelineUserEntry(view, "/last");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "update") {
      try {
        runUpdateCommand();
        view.notice = { kind: "success", text: "ilu is up to date." };
      } catch (error) {
        view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
      }
      pushTimelineUserEntry(view, "/update");
      archiveAssistantStateToTimeline(view);
      return true;
    }

    if (slashCommand === "clear") {
      view.timeline = [];
      view.notice = null;
      view.output = null;
      return true;
    }

    if (slashCommand === "exit" || slashCommand === "quit") {
      close();
      return true;
    }

    const target = resolveSessionSlashTarget(session, slashCommand);
    if (!target) {
      view.notice = { kind: "error", text: `Unknown slash command: /${slashCommand}` };
      return true;
    }

    if (!target.option.valueHint) {
      const feedback: ShellFeedback[] = [];
      clearCandidatePicker(state);
      toggleSessionFlag(session, target.key, feedback);
      setNoticeFromFeedback(view, feedback);
      view.output = null;
      pushTimelineUserEntry(view, `/${slashCommand} ${session.args.get(target.key) === true ? "on" : "off"}`);
      archiveAssistantStateToTimeline(view, {
        fallbackText: buildSessionNarrativeLines(state, session).join("\n"),
      });
      return true;
    }

    if (inlineValue) {
      const feedback: ShellFeedback[] = [];
      if (setSessionValue(session, target.key, inlineValue, feedback)) {
        session.pending = null;
        const { automation, preview } = runBusyOperation(
          getBusyStateForSession(session, target.key),
          () => applyValueChangeEffects(state, session, target.key)
        );
        if (automation) {
          view.notice = automation.notice;
          view.output = automation.panel;
          if (automation.clearSession) {
            clearCandidatePicker(state);
            state.session = null;
            state.rootTask = null;
          }
        } else {
          setNoticeFromFeedback(view, feedback);
          view.output = preview;
        }
        pushTimelineUserEntry(view, `/${slashCommand}${formatInlineValue(inlineValue)}`);
        archiveAssistantStateToTimeline(view, {
          fallbackText: buildSessionNarrativeLines(state, session).join("\n"),
        });
        return true;
      }
      setNoticeFromFeedback(view, feedback);
      return true;
    }

    session.pending = getPendingValuePrompt(session, target.key, slashCommand);
    view.notice = {
      kind: session.pending.notes.length > 0 ? "warning" : "info",
      text: [
        session.pending.examples[0] !== undefined
          ? `${session.pending.title}: ${session.pending.examples[0]}`
          : session.pending.title,
        ...session.pending.notes,
      ].join("  "),
    };
    pushTimelineUserEntry(view, `/${slashCommand}`);
    archiveAssistantStateToTimeline(view, {
      clear: true,
      fallbackText: buildSessionNarrativeLines(state, session).join("\n"),
    });
    setInput("");
    return true;
  };

  const handlePendingInput = () => {
    const session = state.session;
    if (!session?.pending) {
      return;
    }

    const feedback: ShellFeedback[] = [];
    if (setSessionValue(session, session.pending.key, view.input, feedback)) {
      pushTimelineUserEntry(view, `/${session.pending.slashName}${formatInlineValue(view.input)}`);
      const changedKey = session.pending.key;
      session.pending = null;
      const { automation, preview } = runBusyOperation(
        getBusyStateForSession(session, changedKey),
        () => applyValueChangeEffects(state, session, changedKey)
      );
      if (automation) {
        view.notice = automation.notice;
        view.output = automation.panel;
        if (automation.clearSession) {
          clearCandidatePicker(state);
          state.session = null;
          state.rootTask = null;
        }
      } else {
        setNoticeFromFeedback(view, feedback);
        view.output = preview;
      }
      archiveAssistantStateToTimeline(view, {
        fallbackText: buildSessionNarrativeLines(state, session).join("\n"),
      });
      return;
    }

    setNoticeFromFeedback(view, feedback);
  };

  const handleEnter = () => {
    const trimmed = view.input.trim();
    const bangCommand = parseBangInput(trimmed);
    const isSlashInput = shouldTreatAsSlashInput(view.input, state);
    if (bangCommand) {
      if (bangCommand === "xacro") {
        pushTimelineUserEntry(view, "!xacro");
        const result = runBusyOperation(
          {
            title: "xacro",
            lines: ["setting up xacro runtime...", "this can take a moment..."],
          },
          () => runXacroBangCommand(state)
        );
        view.notice = result.notice;
        view.output = result.panel;
        if (result.clearSession) {
          state.session = null;
          state.rootTask = null;
        }
        archiveAssistantStateToTimeline(view);
      }
      setInput("");
      return;
    }

    if (state.candidatePicker && !isSlashInput) {
      const selectedPath = resolveCandidateSelectionInput(state, view.input);
      if (selectedPath) {
        pushTimelineUserEntry(view, selectedPath === view.input.trim() ? selectedPath : view.input.trim() || selectedPath);
        const result = runBusyOperation(
          {
            title: "loading",
            lines: ["loading selected entry...", "running validation and health check..."],
          },
          () => runSelectedCandidatePicker(state, selectedPath)
        );
        view.notice = result?.notice ?? { kind: "error", text: "could not load candidate" };
        view.output = result?.panel ?? null;
        if (result?.clearSession) {
          clearCandidatePicker(state);
          state.session = null;
          state.rootTask = null;
        }
        archiveAssistantStateToTimeline(view);
      } else {
        view.notice = { kind: "warning", text: "pick a valid candidate or paste an entry path" };
      }
      setInput("");
      return;
    }

    if (state.session?.pending && !isSlashInput) {
      handlePendingInput();
      setInput("");
      return;
    }

    if (isSlashInput) {
      const parsed = parseSlashInput(trimmed);
      if (!parsed) {
        return;
      }

      if (!parsed.inlineValue) {
        const menuEntries = getSlashMenuEntries(state, trimmed);
        if (menuEntries.length > 0) {
          const selected = menuEntries[clamp(view.menuIndex, 0, menuEntries.length - 1)];
          if (selected) {
            if (state.session) {
              handleSessionAction(selected.name, "");
            } else if (state.rootTask) {
              handleRootTaskAction(selected.name);
            } else {
              handleRootAction(selected.name);
            }
            syncInputAfterSlashAction({ slashCommand: selected.name, inlineValue: "" });
            return;
          }
        }
      }

      if (state.session) {
        handleSessionAction(parsed.slashCommand, parsed.inlineValue);
      } else if (state.rootTask) {
        handleRootTaskAction(parsed.slashCommand);
      } else {
        handleRootAction(parsed.slashCommand);
      }
      syncInputAfterSlashAction(parsed);
      return;
    }

    if (trimmed.length === 0) {
      if (state.session && !state.session.pending && getRequirementStatus(state.session).ready) {
        handleSessionAction("run", "");
        return;
      }
      view.notice = {
        kind: "info",
        text: state.session || state.rootTask ? getPromptPlaceholder(state) : ROOT_GUIDANCE,
      };
      return;
    }

    if (state.session) {
      const feedback: ShellFeedback[] = [];
      const submittedInput = view.input.trim();
      const applied = applyFreeformInputToSession(state.session, view.input, feedback);
      if (applied) {
        const automated = runBusyOperation(
          getBusyStateForSession(applied.session, applied.key),
          () => runDirectInputAutomation(state, applied.session, applied.key)
        );
        if (automated) {
          view.notice = automated.notice;
          view.output = automated.panel;
          if (automated.clearSession) {
            clearCandidatePicker(state);
            state.session = null;
            state.rootTask = null;
          }
        } else {
          const preview = buildAutoPreviewPanel(state, applied.session, applied.key);
          view.notice = preview
            ? {
                kind: preview.kind === "error" ? "error" : "info",
                text:
                  preview.kind === "error"
                    ? "preview failed"
                    : preview.title === "health"
                      ? "health preview ready"
                      : "preview ready",
              }
            : { kind: "info", text: buildSessionHeadline(applied.session) };
          view.output = preview;
        }
        pushTimelineUserEntry(view, submittedInput);
        archiveAssistantStateToTimeline(view, {
          fallbackText: buildSessionNarrativeLines(state, applied.session).join("\n"),
        });
        setInput("");
        return;
      }
      setNoticeFromFeedback(view, feedback);
    } else {
      const feedback: ShellFeedback[] = [];
      const submittedInput = view.input.trim();
      const applied = applyFreeformInputToRootState(state, view.input, feedback);
      if (applied && state.session) {
        const automated = runBusyOperation(
          getBusyStateForSession(applied.session, applied.key),
          () => runDirectInputAutomation(state, applied.session, applied.key)
        );
        if (automated) {
          view.notice = automated.notice;
          view.output = automated.panel;
          if (automated.clearSession) {
            clearCandidatePicker(state);
            state.session = null;
            state.rootTask = null;
          }
        } else {
          const preview = buildAutoPreviewPanel(state, applied.session, applied.key);
          view.notice = preview
            ? {
                kind: preview.kind === "error" ? "error" : "info",
                text:
                  preview.kind === "error"
                    ? "preview failed"
                    : preview.title === "health"
                      ? "health preview ready"
                      : "preview ready",
              }
            : { kind: "info", text: buildSessionHeadline(applied.session) };
          view.output = preview;
        }
        pushTimelineUserEntry(view, submittedInput);
        archiveAssistantStateToTimeline(view, {
          fallbackText: buildSessionNarrativeLines(state, applied.session).join("\n"),
        });
        setInput("");
        return;
      }
      setNoticeFromFeedback(view, feedback);
    }

    view.notice = { kind: "info", text: "type /, drop a local path, or paste owner/repo" };
    setInput("");
  };

  const render = () => {
    renderTtyShell(state, view);
  };

  const runBusyOperation = <T>(
    busy: {
      title: string;
      lines: readonly string[];
    },
    operation: () => T
  ): T => {
    setInput("");
    view.busy = busy;
    queueRender("force");
    try {
      return operation();
    } finally {
      view.busy = null;
      ignoreKeypressUntilMs = Date.now() + 200;
    }
  };

  let pendingRenderTimer: NodeJS.Timeout | null = null;
  let renderQueued = false;
  let lastRenderAt = 0;
  const queueRender = (mode: "force" | "navigation" | "typing" = "navigation") => {
    const flush = () => {
      if (closed) {
        return;
      }
      renderQueued = false;
      if (pendingRenderTimer) {
        clearTimeout(pendingRenderTimer);
        pendingRenderTimer = null;
      }
      lastRenderAt = Date.now();
      render();
    };

    if (mode === "force") {
      flush();
      return;
    }

    const waitMs = mode === "typing" ? 32 : Math.max(0, 16 - (Date.now() - lastRenderAt));
    if (renderQueued) {
      if (waitMs === 0) {
        flush();
      }
      return;
    }

    renderQueued = true;
    pendingRenderTimer = setTimeout(flush, waitMs);
  };

  if (options.initialSlashCommand) {
    const parsed = parseSlashInput(options.initialSlashCommand);
    if (parsed) {
      handleRootAction(parsed.slashCommand);
    }
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const onResize = () => {
    queueRender("force");
  };

  const onKeypress = (input: string, key: Keypress) => {
    if (closed) {
      return;
    }

    if (view.busy) {
      return;
    }

    if (Date.now() < ignoreKeypressUntilMs && !(key.ctrl && key.name === "c")) {
      return;
    }

    if ((key.ctrl && key.name === "c") || input === "\u0003") {
      close();
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      handleEnter();
      queueRender("force");
      return;
    }

    if (key.name === "up" || (key.shift && key.name === "tab")) {
      if (state.candidatePicker && !view.input.startsWith("/")) {
        state.candidatePicker.selectedIndex = clamp(
          state.candidatePicker.selectedIndex - 1,
          0,
          state.candidatePicker.candidates.length - 1
        );
        queueRender("navigation");
        return;
      }
      const menuEntries = getSlashMenuEntries(state, view.input);
      if (menuEntries.length > 0) {
        view.menuIndex = clamp(view.menuIndex - 1, 0, menuEntries.length - 1);
        queueRender("navigation");
      }
      return;
    }

    if (key.name === "down") {
      if (state.candidatePicker && !view.input.startsWith("/")) {
        state.candidatePicker.selectedIndex = clamp(
          state.candidatePicker.selectedIndex + 1,
          0,
          state.candidatePicker.candidates.length - 1
        );
        queueRender("navigation");
        return;
      }
      const menuEntries = getSlashMenuEntries(state, view.input);
      if (menuEntries.length > 0) {
        view.menuIndex = clamp(view.menuIndex + 1, 0, menuEntries.length - 1);
        queueRender("navigation");
      }
      return;
    }

    if (key.name === "tab") {
      const slashCompletion = completeSelectedSlashInput(view.input, state, view.menuIndex);
      if (slashCompletion) {
        setInput(slashCompletion);
        queueRender("navigation");
        return;
      }

      const pathCompletion = completeTtyPathInput(view.input, state);
      if (pathCompletion) {
        setInput(pathCompletion.nextInput);
        view.notice = pathCompletion.notice;
        queueRender("navigation");
      }
      return;
    }

    if (key.name === "escape") {
      if (view.input.startsWith("/")) {
        setInput("");
        queueRender("navigation");
        return;
      }

      if (state.session?.pending) {
        state.session.pending = null;
        view.notice = { kind: "info", text: "input cancelled" };
        queueRender("navigation");
      }
      return;
    }

    if (key.name === "backspace") {
      if (view.input.length > 0) {
        setInput(view.input.slice(0, -1));
        queueRender("typing");
      }
      return;
    }

    if (key.ctrl && key.name === "u") {
      setInput("");
      queueRender("typing");
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setInput(`${view.input}${input}`);
      if (view.input.startsWith("/")) {
        view.menuIndex = 0;
      }
      view.notice = null;
      queueRender("typing");
    }
  };

  process.stdout.on("resize", onResize);
  process.stdin.on("keypress", onKeypress);

  render();

  try {
    while (!closed) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    if (pendingRenderTimer) {
      clearTimeout(pendingRenderTimer);
    }
    process.stdout.off("resize", onResize);
    process.stdin.off("keypress", onKeypress);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\u001b[H\u001b[J\n");
  }
};

export const renderShellHelp = (): string => {
  return [
    "Start the i<3urdf interactive shell.",
    "",
    "Usage",
    "  ilu",
    "  ilu shell",
    "",
    "Inside the shell",
    "  owner/repo         Load a GitHub repo and auto-run checks",
    "  ./robot.urdf       Run validation and a health check",
    "  ./robot.zip        Unpack and check an uploaded archive",
    "  ./robot-folder/    Load a local repo or folder and auto-run checks",
    "  !xacro            Install or verify the local XACRO runtime",
    "  /                  Open direct actions under the prompt",
    "  up/down            Move through picker options",
    "  tab                Complete the selected option or path",
    "  enter              Select the highlighted option or run the ready action",
    "  ctrl+c             Exit immediately",
    "  esc                Close the picker or cancel a pending value",
    "  /open              Load a repo, folder, or file as the current source",
    "  /inspect           Preview a repo or folder and suggest an entrypoint",
    "  /analyze           Run the compact investigation view",
    "  /health            Run the main health check",
    "  /validate          Validate URDF structure and required tags",
    "  /orientation       Guess the likely up-axis and forward axis",
    "  /update            Install the latest ilu release",
    "  /show              Show the current source and next step",
  ].join("\n");
};

export const runInteractiveShell = async (options: ShellOptions = {}) => {
  if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
    await runTtyInteractiveShell(options);
    return;
  }

  await runLineInteractiveShell(options);
};

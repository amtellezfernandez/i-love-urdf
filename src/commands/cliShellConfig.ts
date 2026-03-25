import * as path from "node:path";
import * as process from "node:process";
import { readGitHubCliToken } from "../node/githubCliAuth";
import {
  COMMAND_COMPLETION_SPEC_BY_NAME,
  type CompletionOptionSpec,
} from "./cliCompletion";
import { type SupportedCommandName } from "./commandCatalog";
import type {
  RootShellCommandDefinition,
  RootTaskActionDefinition,
  RootTaskDefinition,
  RootTaskName,
  ShellFeedback,
  ShellFeedbackKind,
  ShellSession,
  ShellState,
  ShellTheme,
} from "./cliShellTypes";
import type { UpdateAvailability } from "./cliUpdate";

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
  command: (text) => paint(enabled, text, ANSI.brightMagenta),
  icon: (text) => paint(enabled, text, ANSI.gray),
  muted: (text) => paint(enabled, text, ANSI.gray),
  section: (text) => paint(enabled, text, ANSI.dim, ANSI.gray),
  success: (text) => paint(enabled, text, ANSI.green),
  accent: (text) => paint(enabled, text, ANSI.bold, ANSI.brightMagenta),
  warning: (text) => paint(enabled, text, ANSI.bold, ANSI.yellow),
  error: (text) => paint(enabled, text, ANSI.bold, ANSI.red),
  selected: (text) => paint(enabled, text, ANSI.bold, ANSI.brightMagenta),
});

export const SHELL_THEME = createTheme(resolveColorSupport());
export const SHELL_BRAND = "i<3urdf";
export const XACRO_RUNTIME_NOTICE = "xacro runtime not set. run !xacro, then retry";

export const SHELL_BUILTIN_COMMANDS = [
  { name: "help", summary: "Show slash commands for the current context." },
  { name: "visualize", summary: "Open the current ilu session in URDF Studio." },
  { name: "visualize-stop", summary: "Stop the local URDF Studio started by ilu." },
  { name: "doctor", summary: "Show runtime, auth, and xacro diagnostics." },
  { name: "update", summary: "Install the latest ilu release." },
  { name: "clear", summary: "Clear the terminal." },
  { name: "last", summary: "Show the last remembered URDF path." },
] as const;

export const HIDDEN_SHELL_COMMAND_NAMES = ["exit", "quit"] as const;

export const SESSION_BUILTIN_COMMANDS = [
  { name: "show", summary: "Show the current command, values, and next step." },
  { name: "run", summary: "Run the current command." },
  { name: "visualize", summary: "Open the current ilu session in URDF Studio." },
  { name: "visualize-stop", summary: "Stop the local URDF Studio started by ilu." },
  { name: "doctor", summary: "Show runtime, auth, and xacro diagnostics." },
  { name: "update", summary: "Install the latest ilu release." },
  { name: "reset", summary: "Clear the current command state." },
  { name: "back", summary: "Return to the root slash-command menu." },
] as const;

export const ROOT_TASKS = [
  { name: "open", summary: "Open a repo, folder, or file as a working URDF." },
  { name: "inspect", summary: "Preview a repo or URDF before deciding what to do next." },
  { name: "check", summary: "Run health, validation, and orientation checks." },
  { name: "convert", summary: "Convert XACRO and URDF files into other formats." },
  { name: "fix", summary: "Repair mesh paths, mesh refs, and basic URDF issues." },
] as const satisfies readonly RootTaskDefinition[];

export const ROOT_SHELL_COMMANDS = [
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
    summary: "Check the current orientation and offer a safe fix.",
    command: "guess-orientation",
    sessionLabel: "orientation",
    openPending: { key: "urdf", slashName: "file", onlyIfMissing: true },
  },
] as const satisfies readonly RootShellCommandDefinition[];

export const ROOT_START_COMMAND_NAMES = [
  "open",
  "inspect",
  "analyze",
  "health",
  "validate",
  "orientation",
] as const;
export const ROOT_READY_COMMAND_NAMES = [
  "analyze",
  "health",
  "validate",
  "orientation",
  "open",
  "inspect",
] as const;
export const FLAT_ROOT_SESSION_LABELS = new Set<string>(
  ROOT_SHELL_COMMANDS.map((entry) => entry.sessionLabel)
);

export const ROOT_TASK_ACTIONS = {
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
      summary: "Check the current orientation and offer a safe fix.",
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

export const COMMAND_SUMMARY_OVERRIDES: Partial<Record<SupportedCommandName, string>> = {
  "load-source": "Load from GitHub, a local repo, or a local file.",
  "inspect-repo": "Preview a local or GitHub repo and suggest the right URDF or XACRO entrypoint.",
  "xacro-to-urdf": "Expand a XACRO file, repo, or GitHub source into URDF.",
  "repair-mesh-refs": "Repair broken mesh references in a local or GitHub repo.",
  "health-check": "Check structure, axes, and orientation risks.",
  analyze: "Inspect structure, morphology, and mesh references.",
  validate: "Check whether the current URDF is structurally valid.",
  "guess-orientation": "Check the current orientation and offer a safe fix.",
};

export const URDF_OUTPUT_COMMANDS = new Set<SupportedCommandName>([
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

export const ADVANCED_OPTION_KEYS = new Set([
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

export const SESSION_OPTION_ORDER = {
  "load-source": ["github", "path", "entry", "out", "ref", "subdir", "args", "python", "wheel", "token", "root"],
  "inspect-repo": ["github", "local", "path", "ref", "max-candidates", "token", "out"],
  "repair-mesh-refs": ["github", "local", "urdf", "path", "ref", "token", "out"],
  "xacro-to-urdf": ["xacro", "github", "local", "entry", "out", "args", "ref", "path", "python", "wheel", "token", "root"],
  "health-check": ["urdf", "strict"],
  validate: ["urdf"],
  analyze: ["urdf"],
  diff: ["left", "right"],
} as const satisfies Partial<Record<SupportedCommandName, readonly string[]>>;

export const MUTUALLY_EXCLUSIVE_OPTION_GROUPS: Partial<
  Record<SupportedCommandName, readonly (readonly string[])[]>
> = {
  "load-source": [["path", "github"]],
  "inspect-repo": [["local", "github"]],
  "repair-mesh-refs": [["local", "github"]],
  "xacro-to-urdf": [["local", "github"]],
  "urdf-to-usd": [["urdf", "path"]],
};

export const SESSION_SLASH_ALIASES: Partial<
  Record<SupportedCommandName, Readonly<Record<string, string>>>
> = {
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

export const CLI_ENTRY_PATH = path.resolve(__dirname, "..", "cli.js");
export const ROOT_GUIDANCE =
  "paste repo or local path  / actions  !xacro setup  ctrl+c quit";

let cachedGitHubAuthState: boolean | undefined;

export const formatShellPrompt = (_state: ShellState): string => "/> ";
export const hasPendingUpdatePrompt = (state: ShellState): boolean => state.updatePrompt !== null;
export const dismissUpdatePrompt = (state: ShellState) => {
  state.updatePrompt = null;
};
export const formatUpdatePromptLine = (update: UpdateAvailability): string =>
  `update available ${update.currentVersion} -> ${update.latestVersion}  Enter updates now  Esc skips`;

export const quoteForPreview = (value: string): string =>
  /\s/.test(value) ? JSON.stringify(value) : value;

export const buildCommandPreview = (
  command: string,
  args: Map<string, string | boolean>
): string => {
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

export const pushFeedback = (
  feedback: ShellFeedback[] | undefined,
  kind: ShellFeedbackKind,
  text: string
) => {
  feedback?.push({ kind, text });
};

export const writeFeedback = (entry: ShellFeedback) => {
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

export const flushFeedback = (feedback: readonly ShellFeedback[]) => {
  for (const entry of feedback) {
    writeFeedback(entry);
  }
};

export const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

export const formatInlineValue = (value: string): string =>
  value.length > 0 ? ` ${quoteForPreview(value)}` : "";

export const clearCandidatePicker = (state: ShellState) => {
  state.candidatePicker = null;
};

export const clearXacroRetry = (state: ShellState) => {
  state.xacroRetry = null;
};

export const clearSuggestedAction = (state: ShellState) => {
  state.suggestedAction = null;
};

export const hasGitHubAuthConfigured = (): boolean => {
  if (cachedGitHubAuthState !== undefined) {
    return cachedGitHubAuthState;
  }

  const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  cachedGitHubAuthState = Boolean(envToken || readGitHubCliToken());
  return cachedGitHubAuthState;
};

export const getSlashAliasesForCommand = (
  command: SupportedCommandName
): Readonly<Record<string, string>> => SESSION_SLASH_ALIASES[command] ?? {};

export const getOptionSpecByKey = (
  session: ShellSession,
  key: string
): CompletionOptionSpec | undefined =>
  session.spec.options.find((option) => option.flag === `--${key}`);

export const getPreferredSlashName = (session: ShellSession, key: string): string => {
  const alias = Object.entries(getSlashAliasesForCommand(session.command)).find(
    ([, target]) => target === key
  )?.[0];
  return alias ?? key;
};

export const getSlashDisplayName = (session: ShellSession, key: string): string =>
  `/${getPreferredSlashName(session, key)}`;

export const getShellCommandSummary = (command: SupportedCommandName): string =>
  COMMAND_SUMMARY_OVERRIDES[command] ?? COMMAND_COMPLETION_SPEC_BY_NAME[command].summary;

export const getRootTaskSummary = (task: RootTaskName): string =>
  ROOT_TASKS.find((entry) => entry.name === task)?.summary ?? "Task flow";

export const getRootTaskActionDefinitions = (
  task: RootTaskName
): readonly RootTaskActionDefinition[] => ROOT_TASK_ACTIONS[task];

export const getRootShellCommandDefinition = (
  name: string
): RootShellCommandDefinition | undefined =>
  ROOT_SHELL_COMMANDS.find((entry) => entry.name === name);

export const isFlatRootSession = (session: ShellSession): boolean =>
  FLAT_ROOT_SESSION_LABELS.has(session.label);

export const shouldSuppressSessionOptionMenu = (session: ShellSession): boolean =>
  isFlatRootSession(session) && (session.pending !== null || session.args.size === 0);

export const getOptionOrderRank = (session: ShellSession, key: string): number => {
  const customOrder = SESSION_OPTION_ORDER[session.command] ?? [];
  const customIndex = customOrder.indexOf(key);
  return customIndex === -1 ? Number.MAX_SAFE_INTEGER : customIndex;
};

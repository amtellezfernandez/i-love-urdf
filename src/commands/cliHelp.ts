import * as process from "node:process";
import { CLI_HELP_SECTIONS, COMMAND_CATALOG, type HelpSectionDefinition } from "./commandCatalog";

type RenderHelpOptions = {
  colorEnabled?: boolean;
};

type HelpTheme = {
  enabled: boolean;
  title: (text: string) => string;
  label: (text: string) => string;
  section: (text: string) => string;
  summary: (text: string) => string;
  command: (text: string) => string;
  option: (text: string) => string;
  placeholder: (text: string) => string;
  subtle: (text: string) => string;
};

type ParsedUsageLine = {
  command: string;
  rest: string;
};

const HELP_INDENT = "  ";
const HELP_COMMAND_GAP = "  ";
const HELP_SYNTAX_TOKEN_PATTERN = /(--[a-z0-9-]+|<[^>]+>|[\[\]\|])/gi;
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  gray: "\u001b[90m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  magenta: "\u001b[35m",
  yellow: "\u001b[33m",
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

const createTheme = (enabled: boolean): HelpTheme => ({
  enabled,
  title: (text) => paint(enabled, text, ANSI.bold, ANSI.magenta),
  label: (text) => paint(enabled, text, ANSI.bold, ANSI.cyan),
  section: (text) => paint(enabled, text, ANSI.bold, ANSI.green),
  summary: (text) => paint(enabled, text, ANSI.dim),
  command: (text) => paint(enabled, text, ANSI.bold, ANSI.green),
  option: (text) => paint(enabled, text, ANSI.cyan),
  placeholder: (text) => paint(enabled, text, ANSI.yellow),
  subtle: (text) => paint(enabled, text, ANSI.gray),
});

const parseUsageLine = (usageLine: string): ParsedUsageLine => {
  const normalized = usageLine.trim();
  const firstSpaceIndex = normalized.indexOf(" ");
  if (firstSpaceIndex === -1) {
    return { command: normalized, rest: "" };
  }
  return {
    command: normalized.slice(0, firstSpaceIndex),
    rest: normalized.slice(firstSpaceIndex + 1).trim(),
  };
};

const highlightUsageSyntax = (text: string, theme: HelpTheme): string => {
  if (!theme.enabled) {
    return text;
  }

  return text
    .split(HELP_SYNTAX_TOKEN_PATTERN)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part.startsWith("--")) {
        return theme.option(part);
      }
      if (part.startsWith("<") && part.endsWith(">")) {
        return theme.placeholder(part);
      }
      if (part === "[" || part === "]" || part === "|") {
        return theme.subtle(part);
      }
      return part;
    })
    .join("");
};

const formatUsageLine = (usageLine: string, commandWidth: number, theme: HelpTheme): string => {
  const parsed = parseUsageLine(usageLine);
  const paddedCommand = parsed.command.padEnd(commandWidth);
  const rest = parsed.rest ? `${HELP_COMMAND_GAP}${highlightUsageSyntax(parsed.rest, theme)}` : "";
  return `${HELP_INDENT}${theme.command(paddedCommand)}${rest}`;
};

const formatHelpSection = (section: HelpSectionDefinition, theme: HelpTheme): string => {
  const usageLines = section.commands.flatMap((commandName) => COMMAND_CATALOG[commandName].usage);
  const parsedUsageLines = usageLines.map(parseUsageLine);
  const commandWidth = parsedUsageLines.reduce((widest, usage) => Math.max(widest, usage.command.length), 0);

  return [
    theme.section(section.title),
    section.summary ? `${HELP_INDENT}${theme.summary(section.summary)}` : null,
    ...usageLines.map((usageLine) => formatUsageLine(usageLine, commandWidth, theme)),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const formatBlock = (label: string, lines: readonly string[], theme: HelpTheme): string =>
  [theme.label(label), ...lines.map((line) => `${HELP_INDENT}${line}`)].join("\n");

const formatUsageBannerLine = (text: string, theme: HelpTheme): string => {
  if (text === "ilu") {
    return theme.command(text);
  }

  const prefix = "ilu ";
  if (text.startsWith(prefix)) {
    return `${theme.command("ilu")} ${highlightUsageSyntax(text.slice(prefix.length), theme)}`;
  }

  return highlightUsageSyntax(text, theme);
};

export const renderHelp = (options: RenderHelpOptions = {}): string => {
  const theme = createTheme(options.colorEnabled ?? resolveColorSupport());
  const helpSections = CLI_HELP_SECTIONS.map((section) => formatHelpSection(section, theme));
  const helpSectionBlocks = helpSections.flatMap((section, index) => (index === 0 ? [section] : ["", section]));

  return [
    theme.title("ILU CLI"),
    theme.summary("Interactive shell for loading, checking, fixing, and converting URDFs."),
    "",
    formatBlock(
      "Usage",
      [
        `${formatUsageBannerLine("ilu", theme)}  ${theme.summary("Open the interactive shell.")}`,
        `${formatUsageBannerLine("ilu resume", theme)}  ${theme.summary("Resume the most recent shared session.")}`,
        `${formatUsageBannerLine("ilu attach <session-id>", theme)}  ${theme.summary("Attach the terminal to an existing shared session.")}`,
        `${formatUsageBannerLine("ilu <command> [arguments]", theme)}  ${theme.summary("Run a one-shot command.")}`,
      ],
      theme
    ),
    "",
    formatBlock(
      "Workflow",
      [
        "1. type `ilu`",
        "2. paste `owner/repo` or drop a local folder, `.urdf`, `.xacro`, or `.zip`",
        "3. ilu auto-runs validation and a health check when it can",
        "4. if a repo has multiple robots, choose whether to work on one, run `/gallery`, or apply `/repo-fixes`",
        "5. if there are multiple entrypoints for one robot flow, use arrows and Enter to pick one",
        "6. if a newer release is available, ilu asks whether you want to update",
        "7. if XACRO runtime is missing, run `!xacro` inside the shell",
        "8. run `ilu doctor` if the environment or runtime looks wrong",
        "9. run `ilu bug-report --out <dir>` if you need a support bundle with diagnostics and local inputs",
        "10. use `/` only when you want direct actions like `/analyze` or `/validate`",
        "11. use `/visualize` to open the current robot in URDF Studio",
        "12. use `ilu attach <session-id>` to resume the same robot from another terminal",
        "13. run `ilu resume` to reopen the most recent session explicitly",
      ],
      theme
    ),
    "",
    formatBlock("Update", ["ilu update"], theme),
    "",
    formatBlock(
      "Support",
      ["ilu doctor", "ilu doctor --json", "ilu bug-report --out <dir> [--urdf <path>] [--source <path>]"],
      theme
    ),
    "",
    ...helpSectionBlocks,
    "",
    formatBlock("GitHub Auth", ["gh auth login", "gh auth status"], theme),
    "",
    formatBlock(
      "Shell",
      ["ilu", "ilu shell", "ilu resume", "ilu attach <session-id>", "Paste owner/repo or drop a local path directly to start. ilu auto-loads the source and runs validation plus a health check when it can. When a repo has many robots, ilu lets you work on one, run /gallery for the repo, or apply /repo-fixes. Plain `ilu` always starts clean. Use `ilu resume` or `ilu attach <session-id>` when you want to reopen a shared session explicitly. If a newer release is available, the shell asks whether you want to update. If XACRO runtime is missing, run !xacro in the shell. Use / when you want direct actions like /align, /analyze, /health, /validate, /orientation, /gallery, /repo-fixes, /open, /inspect, or /visualize. Use /show to inspect the current context, /update for latest, and Ctrl+C to quit."],
      theme
    ),
    "",
    formatBlock("Completion", ["ilu completion bash", "ilu completion zsh", "ilu completion fish"], theme),
    "",
    formatBlock(
      "Token Resolution",
      ["--token <token> -> GITHUB_TOKEN -> GH_TOKEN -> GitHub CLI auth"],
      theme
    ),
    "",
    formatBlock("Output", ["One-shot commands print JSON to stdout.", "`ilu` opens the interactive shell."], theme),
  ].join("\n");
};

export const printHelp = (options: RenderHelpOptions = {}) => {
  console.log(renderHelp(options));
};

export const renderAttachHelp = (options: RenderHelpOptions = {}): string => {
  const theme = createTheme(options.colorEnabled ?? resolveColorSupport());
  return [
    theme.title("Attach To A Shared ILU Session"),
    "",
    formatBlock("Usage", [`${formatUsageBannerLine("ilu attach <session-id>", theme)}  ${theme.summary("Resume a robot that is already loaded in another ilu shell or in URDF Studio.")}`], theme),
    "",
    formatBlock(
      "Examples",
      [
        "ilu attach 8c8d0f4a-6fca-4b8f-94f9-26d7c0c0f2c5",
        "ilu attach 8c8d0f4a-6fca-4b8f-94f9-26d7c0c0f2c5 --help",
      ],
      theme
    ),
    "",
    formatBlock(
      "Notes",
      [
        "Attach uses the shared working URDF stored under ~/.i-love-urdf/sessions/<session-id>/.",
        "Use /visualize inside the shell to open the same session in URDF Studio.",
      ],
      theme
    ),
  ].join("\n");
};

export const renderResumeHelp = (options: RenderHelpOptions = {}): string => {
  const theme = createTheme(options.colorEnabled ?? resolveColorSupport());
  return [
    theme.title("Resume The Most Recent ILU Session"),
    "",
    formatBlock(
      "Usage",
      [
        `${formatUsageBannerLine("ilu resume", theme)}  ${theme.summary("Resume the most recent shared working session from the shell or URDF Studio.")}`,
      ],
      theme
    ),
    "",
    formatBlock(
      "Notes",
      [
        "Plain `ilu` starts a new shell without reopening the last session automatically.",
        "Use `ilu attach <session-id>` when you need a specific shared session instead of the most recent one.",
      ],
      theme
    ),
  ].join("\n");
};

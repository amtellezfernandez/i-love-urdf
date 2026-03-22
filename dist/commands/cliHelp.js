"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printHelp = exports.renderHelp = void 0;
const process = require("node:process");
const commandCatalog_1 = require("./commandCatalog");
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
};
const paint = (enabled, text, ...codes) => {
    if (!enabled || text.length === 0) {
        return text;
    }
    return `${codes.join("")}${text}${ANSI.reset}`;
};
const resolveColorSupport = () => {
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
const createTheme = (enabled) => ({
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
const parseUsageLine = (usageLine) => {
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
const highlightUsageSyntax = (text, theme) => {
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
const formatUsageLine = (usageLine, commandWidth, theme) => {
    const parsed = parseUsageLine(usageLine);
    const paddedCommand = parsed.command.padEnd(commandWidth);
    const rest = parsed.rest ? `${HELP_COMMAND_GAP}${highlightUsageSyntax(parsed.rest, theme)}` : "";
    return `${HELP_INDENT}${theme.command(paddedCommand)}${rest}`;
};
const formatHelpSection = (section, theme) => {
    const usageLines = section.commands.flatMap((commandName) => commandCatalog_1.COMMAND_CATALOG[commandName].usage);
    const parsedUsageLines = usageLines.map(parseUsageLine);
    const commandWidth = parsedUsageLines.reduce((widest, usage) => Math.max(widest, usage.command.length), 0);
    return [
        theme.section(section.title),
        section.summary ? `${HELP_INDENT}${theme.summary(section.summary)}` : null,
        ...usageLines.map((usageLine) => formatUsageLine(usageLine, commandWidth, theme)),
    ]
        .filter((line) => Boolean(line))
        .join("\n");
};
const formatBlock = (label, lines, theme) => [theme.label(label), ...lines.map((line) => `${HELP_INDENT}${line}`)].join("\n");
const formatUsageBannerLine = (text, theme) => {
    if (text === "ilu") {
        return theme.command(text);
    }
    const prefix = "ilu ";
    if (text.startsWith(prefix)) {
        return `${theme.command("ilu")} ${highlightUsageSyntax(text.slice(prefix.length), theme)}`;
    }
    return highlightUsageSyntax(text, theme);
};
const renderHelp = (options = {}) => {
    const theme = createTheme(options.colorEnabled ?? resolveColorSupport());
    const helpSections = commandCatalog_1.CLI_HELP_SECTIONS.map((section) => formatHelpSection(section, theme));
    const helpSectionBlocks = helpSections.flatMap((section, index) => (index === 0 ? [section] : ["", section]));
    return [
        theme.title("ILU CLI"),
        theme.summary("Interactive shell for loading, checking, fixing, and converting URDFs."),
        "",
        formatBlock("Usage", [
            `${formatUsageBannerLine("ilu", theme)}  ${theme.summary("Open the interactive shell.")}`,
            `${formatUsageBannerLine("ilu <command> [arguments]", theme)}  ${theme.summary("Run a one-shot command.")}`,
        ], theme),
        "",
        formatBlock("Workflow", [
            "1. type `ilu`",
            "2. type `/` to see helpers",
            "3. follow the next-step prompts and `/run` when ready",
        ], theme),
        "",
        formatBlock("Update", ["ilu update"], theme),
        "",
        ...helpSectionBlocks,
        "",
        formatBlock("GitHub Auth", ["gh auth login", "gh auth status"], theme),
        "",
        formatBlock("Shell", ["ilu", "ilu shell", "Type / for task flows like /open, /inspect, /check, /convert, and /fix. Use /show to inspect the current flow, /update for latest, and Ctrl+C to quit."], theme),
        "",
        formatBlock("Completion", ["ilu completion bash", "ilu completion zsh", "ilu completion fish"], theme),
        "",
        formatBlock("Token Resolution", ["--token <token> -> GITHUB_TOKEN -> GH_TOKEN -> GitHub CLI auth"], theme),
        "",
        formatBlock("Output", ["One-shot commands print JSON to stdout.", "`ilu` opens the interactive shell."], theme),
    ].join("\n");
};
exports.renderHelp = renderHelp;
const printHelp = (options = {}) => {
    console.log((0, exports.renderHelp)(options));
};
exports.printHelp = printHelp;

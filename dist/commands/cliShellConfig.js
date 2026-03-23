"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOptionOrderRank = exports.shouldSuppressSessionOptionMenu = exports.isFlatRootSession = exports.getRootShellCommandDefinition = exports.getRootTaskActionDefinitions = exports.getRootTaskSummary = exports.getShellCommandSummary = exports.getSlashDisplayName = exports.getPreferredSlashName = exports.getOptionSpecByKey = exports.getSlashAliasesForCommand = exports.hasGitHubAuthConfigured = exports.clearSuggestedAction = exports.clearXacroRetry = exports.clearCandidatePicker = exports.formatInlineValue = exports.clamp = exports.stripAnsi = exports.flushFeedback = exports.writeFeedback = exports.pushFeedback = exports.buildCommandPreview = exports.quoteForPreview = exports.formatUpdatePromptLine = exports.dismissUpdatePrompt = exports.hasPendingUpdatePrompt = exports.formatShellPrompt = exports.ROOT_GUIDANCE = exports.CLI_ENTRY_PATH = exports.SESSION_SLASH_ALIASES = exports.MUTUALLY_EXCLUSIVE_OPTION_GROUPS = exports.SESSION_OPTION_ORDER = exports.ADVANCED_OPTION_KEYS = exports.URDF_OUTPUT_COMMANDS = exports.COMMAND_SUMMARY_OVERRIDES = exports.ROOT_TASK_ACTIONS = exports.FLAT_ROOT_SESSION_LABELS = exports.ROOT_READY_COMMAND_NAMES = exports.ROOT_START_COMMAND_NAMES = exports.ROOT_SHELL_COMMANDS = exports.ROOT_TASKS = exports.SESSION_BUILTIN_COMMANDS = exports.HIDDEN_SHELL_COMMAND_NAMES = exports.SHELL_BUILTIN_COMMANDS = exports.XACRO_RUNTIME_NOTICE = exports.SHELL_BRAND = exports.SHELL_THEME = void 0;
const path = require("node:path");
const process = require("node:process");
const githubCliAuth_1 = require("../node/githubCliAuth");
const cliCompletion_1 = require("./cliCompletion");
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
exports.SHELL_THEME = createTheme(resolveColorSupport());
exports.SHELL_BRAND = "i<3urdf";
exports.XACRO_RUNTIME_NOTICE = "xacro runtime not set. run !xacro, then retry";
exports.SHELL_BUILTIN_COMMANDS = [
    { name: "help", summary: "Show slash commands for the current context." },
    { name: "visualize", summary: "Open the current ilu session in URDF Studio." },
    { name: "doctor", summary: "Show runtime, auth, and xacro diagnostics." },
    { name: "update", summary: "Install the latest ilu release." },
    { name: "clear", summary: "Clear the terminal." },
    { name: "last", summary: "Show the last remembered URDF path." },
];
exports.HIDDEN_SHELL_COMMAND_NAMES = ["exit", "quit"];
exports.SESSION_BUILTIN_COMMANDS = [
    { name: "show", summary: "Show the current command, values, and next step." },
    { name: "run", summary: "Run the current command." },
    { name: "visualize", summary: "Open the current ilu session in URDF Studio." },
    { name: "doctor", summary: "Show runtime, auth, and xacro diagnostics." },
    { name: "update", summary: "Install the latest ilu release." },
    { name: "reset", summary: "Clear the current command state." },
    { name: "back", summary: "Return to the root slash-command menu." },
];
exports.ROOT_TASKS = [
    { name: "open", summary: "Open a repo, folder, or file as a working URDF." },
    { name: "inspect", summary: "Preview a repo or URDF before deciding what to do next." },
    { name: "check", summary: "Run health, validation, and orientation checks." },
    { name: "convert", summary: "Convert XACRO and URDF files into other formats." },
    { name: "fix", summary: "Repair mesh paths, mesh refs, and basic URDF issues." },
];
exports.ROOT_SHELL_COMMANDS = [
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
];
exports.ROOT_START_COMMAND_NAMES = [
    "open",
    "inspect",
    "analyze",
    "health",
    "validate",
    "orientation",
];
exports.ROOT_READY_COMMAND_NAMES = [
    "analyze",
    "health",
    "validate",
    "orientation",
    "open",
    "inspect",
];
exports.FLAT_ROOT_SESSION_LABELS = new Set(exports.ROOT_SHELL_COMMANDS.map((entry) => entry.sessionLabel));
exports.ROOT_TASK_ACTIONS = {
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
};
exports.COMMAND_SUMMARY_OVERRIDES = {
    "load-source": "Load from GitHub, a local repo, or a local file.",
    "inspect-repo": "Preview a local or GitHub repo and suggest the right URDF or XACRO entrypoint.",
    "xacro-to-urdf": "Expand a XACRO file, repo, or GitHub source into URDF.",
    "repair-mesh-refs": "Repair broken mesh references in a local or GitHub repo.",
    "health-check": "Check structure, axes, and orientation risks.",
    analyze: "Inspect structure, morphology, and mesh references.",
    validate: "Check whether the current URDF is structurally valid.",
    "guess-orientation": "Check the current orientation and offer a safe fix.",
};
exports.URDF_OUTPUT_COMMANDS = new Set([
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
exports.ADVANCED_OPTION_KEYS = new Set([
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
exports.SESSION_OPTION_ORDER = {
    "load-source": ["github", "path", "entry", "out", "ref", "subdir", "args", "python", "wheel", "token", "root"],
    "inspect-repo": ["github", "local", "path", "ref", "max-candidates", "token", "out"],
    "repair-mesh-refs": ["github", "local", "urdf", "path", "ref", "token", "out"],
    "xacro-to-urdf": ["xacro", "github", "local", "entry", "out", "args", "ref", "path", "python", "wheel", "token", "root"],
    "health-check": ["urdf", "strict"],
    validate: ["urdf"],
    analyze: ["urdf"],
    diff: ["left", "right"],
};
exports.MUTUALLY_EXCLUSIVE_OPTION_GROUPS = {
    "load-source": [["path", "github"]],
    "inspect-repo": [["local", "github"]],
    "repair-mesh-refs": [["local", "github"]],
    "xacro-to-urdf": [["local", "github"]],
    "urdf-to-usd": [["urdf", "path"]],
};
exports.SESSION_SLASH_ALIASES = {
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
exports.CLI_ENTRY_PATH = path.resolve(__dirname, "..", "cli.js");
exports.ROOT_GUIDANCE = "paste repo or local path  / actions  !xacro setup  ctrl+c quit";
let cachedGitHubAuthState;
const formatShellPrompt = (_state) => "/> ";
exports.formatShellPrompt = formatShellPrompt;
const hasPendingUpdatePrompt = (state) => state.updatePrompt !== null;
exports.hasPendingUpdatePrompt = hasPendingUpdatePrompt;
const dismissUpdatePrompt = (state) => {
    state.updatePrompt = null;
};
exports.dismissUpdatePrompt = dismissUpdatePrompt;
const formatUpdatePromptLine = (update) => `update available ${update.currentVersion} -> ${update.latestVersion}  Enter updates now  Esc skips`;
exports.formatUpdatePromptLine = formatUpdatePromptLine;
const quoteForPreview = (value) => /\s/.test(value) ? JSON.stringify(value) : value;
exports.quoteForPreview = quoteForPreview;
const buildCommandPreview = (command, args) => {
    const serializedArgs = Array.from(args.entries()).flatMap(([key, value]) => {
        if (value === false || value === undefined || value === null) {
            return [];
        }
        if (value === true) {
            return [`--${key}`];
        }
        return [`--${key}`, (0, exports.quoteForPreview)(String(value))];
    });
    return `ilu ${[command, ...serializedArgs].join(" ")}`.trim();
};
exports.buildCommandPreview = buildCommandPreview;
const pushFeedback = (feedback, kind, text) => {
    feedback?.push({ kind, text });
};
exports.pushFeedback = pushFeedback;
const writeFeedback = (entry) => {
    const stream = entry.kind === "error" ? process.stderr : process.stdout;
    const render = entry.kind === "success"
        ? exports.SHELL_THEME.success
        : entry.kind === "warning"
            ? exports.SHELL_THEME.warning
            : entry.kind === "error"
                ? exports.SHELL_THEME.error
                : exports.SHELL_THEME.muted;
    stream.write(`${render(entry.text)}\n`);
};
exports.writeFeedback = writeFeedback;
const flushFeedback = (feedback) => {
    for (const entry of feedback) {
        (0, exports.writeFeedback)(entry);
    }
};
exports.flushFeedback = flushFeedback;
const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*m/g, "");
exports.stripAnsi = stripAnsi;
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
exports.clamp = clamp;
const formatInlineValue = (value) => value.length > 0 ? ` ${(0, exports.quoteForPreview)(value)}` : "";
exports.formatInlineValue = formatInlineValue;
const clearCandidatePicker = (state) => {
    state.candidatePicker = null;
};
exports.clearCandidatePicker = clearCandidatePicker;
const clearXacroRetry = (state) => {
    state.xacroRetry = null;
};
exports.clearXacroRetry = clearXacroRetry;
const clearSuggestedAction = (state) => {
    state.suggestedAction = null;
};
exports.clearSuggestedAction = clearSuggestedAction;
const hasGitHubAuthConfigured = () => {
    if (cachedGitHubAuthState !== undefined) {
        return cachedGitHubAuthState;
    }
    const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
    cachedGitHubAuthState = Boolean(envToken || (0, githubCliAuth_1.readGitHubCliToken)());
    return cachedGitHubAuthState;
};
exports.hasGitHubAuthConfigured = hasGitHubAuthConfigured;
const getSlashAliasesForCommand = (command) => exports.SESSION_SLASH_ALIASES[command] ?? {};
exports.getSlashAliasesForCommand = getSlashAliasesForCommand;
const getOptionSpecByKey = (session, key) => session.spec.options.find((option) => option.flag === `--${key}`);
exports.getOptionSpecByKey = getOptionSpecByKey;
const getPreferredSlashName = (session, key) => {
    const alias = Object.entries((0, exports.getSlashAliasesForCommand)(session.command)).find(([, target]) => target === key)?.[0];
    return alias ?? key;
};
exports.getPreferredSlashName = getPreferredSlashName;
const getSlashDisplayName = (session, key) => `/${(0, exports.getPreferredSlashName)(session, key)}`;
exports.getSlashDisplayName = getSlashDisplayName;
const getShellCommandSummary = (command) => exports.COMMAND_SUMMARY_OVERRIDES[command] ?? cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME[command].summary;
exports.getShellCommandSummary = getShellCommandSummary;
const getRootTaskSummary = (task) => exports.ROOT_TASKS.find((entry) => entry.name === task)?.summary ?? "Task flow";
exports.getRootTaskSummary = getRootTaskSummary;
const getRootTaskActionDefinitions = (task) => exports.ROOT_TASK_ACTIONS[task];
exports.getRootTaskActionDefinitions = getRootTaskActionDefinitions;
const getRootShellCommandDefinition = (name) => exports.ROOT_SHELL_COMMANDS.find((entry) => entry.name === name);
exports.getRootShellCommandDefinition = getRootShellCommandDefinition;
const isFlatRootSession = (session) => exports.FLAT_ROOT_SESSION_LABELS.has(session.label);
exports.isFlatRootSession = isFlatRootSession;
const shouldSuppressSessionOptionMenu = (session) => (0, exports.isFlatRootSession)(session) && (session.pending !== null || session.args.size === 0);
exports.shouldSuppressSessionOptionMenu = shouldSuppressSessionOptionMenu;
const getOptionOrderRank = (session, key) => {
    const customOrder = exports.SESSION_OPTION_ORDER[session.command] ?? [];
    const customIndex = customOrder.indexOf(key);
    return customIndex === -1 ? Number.MAX_SAFE_INTEGER : customIndex;
};
exports.getOptionOrderRank = getOptionOrderRank;

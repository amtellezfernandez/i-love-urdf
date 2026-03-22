"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInteractiveShell = exports.renderShellHelp = void 0;
const node_child_process_1 = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const process = require("node:process");
const commandCatalog_1 = require("./commandCatalog");
const cliCompletion_1 = require("./cliCompletion");
const cliUpdate_1 = require("./cliUpdate");
const githubCliAuth_1 = require("../node/githubCliAuth");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
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
    command: (text) => paint(enabled, text, ANSI.bold, ANSI.magenta),
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
const SHELL_BUILTIN_COMMANDS = [
    { name: "help", summary: "Show slash commands for the current context." },
    { name: "update", summary: "Install the latest ilu release." },
    { name: "clear", summary: "Clear the terminal." },
    { name: "last", summary: "Show the last remembered URDF path." },
    { name: "exit", summary: "Exit the interactive shell." },
    { name: "quit", summary: "Exit the interactive shell." },
];
const SESSION_BUILTIN_COMMANDS = [
    { name: "show", summary: "Show the current command, values, and next step." },
    { name: "run", summary: "Run the current command." },
    { name: "update", summary: "Install the latest ilu release." },
    { name: "reset", summary: "Clear the current helper state." },
    { name: "back", summary: "Return to the root slash-command menu." },
];
const ROOT_TASKS = [
    { name: "open", summary: "Open a repo, folder, or file as a working URDF." },
    { name: "inspect", summary: "Preview a repo or URDF before deciding what to do next." },
    { name: "check", summary: "Run health, validation, and orientation checks." },
    { name: "convert", summary: "Convert XACRO and URDF files into other formats." },
    { name: "fix", summary: "Repair mesh paths, mesh refs, and basic URDF issues." },
];
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
};
const COMMAND_SUMMARY_OVERRIDES = {
    "load-source": "Load from GitHub, a local repo, or a local file.",
    "inspect-repo": "Preview a local or GitHub repo and suggest the right URDF or XACRO entrypoint.",
    "xacro-to-urdf": "Expand a XACRO file, repo, or GitHub source into URDF.",
    "repair-mesh-refs": "Repair broken mesh references in a local or GitHub repo.",
    "health-check": "Check structure, axes, and orientation risks.",
    analyze: "Inspect structure, morphology, and mesh references.",
    validate: "Check whether the current URDF is structurally valid.",
    "guess-orientation": "Guess the likely up-axis and forward axis.",
};
const URDF_OUTPUT_COMMANDS = new Set([
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
};
const MUTUALLY_EXCLUSIVE_OPTION_GROUPS = {
    "load-source": [["path", "github"]],
    "inspect-repo": [["local", "github"]],
    "repair-mesh-refs": [["local", "github"]],
    "xacro-to-urdf": [["local", "github"]],
    "urdf-to-usd": [["urdf", "path"]],
};
const SESSION_SLASH_ALIASES = {
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
const ROOT_GUIDANCE = "paste owner/repo or drop a local folder/file. type / for extra helpers, /update for latest, ctrl+c to quit";
let cachedGitHubAuthState;
const formatRootPrompt = (state) => state?.rootTask ? `/${state.rootTask}> ` : "/> ";
const formatSessionPrompt = (session) => session.pending ? `/${session.pending.slashName}> ` : `/${session.label}> `;
const quoteForPreview = (value) => (/\s/.test(value) ? JSON.stringify(value) : value);
const buildCommandPreview = (command, args) => {
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
const pushFeedback = (feedback, kind, text) => {
    feedback?.push({ kind, text });
};
const writeFeedback = (entry) => {
    const stream = entry.kind === "error" ? process.stderr : process.stdout;
    const render = entry.kind === "success"
        ? SHELL_THEME.success
        : entry.kind === "warning"
            ? SHELL_THEME.warning
            : entry.kind === "error"
                ? SHELL_THEME.error
                : SHELL_THEME.muted;
    stream.write(`${render(entry.text)}\n`);
};
const flushFeedback = (feedback) => {
    for (const entry of feedback) {
        writeFeedback(entry);
    }
};
const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*m/g, "");
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const formatInlineValue = (value) => (value.length > 0 ? ` ${quoteForPreview(value)}` : "");
const createOutputPanel = (title, content, kind = "info") => {
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
const printOutputPanel = (panel) => {
    if (!panel) {
        return;
    }
    printSectionTitle(panel.title);
    const render = panel.kind === "error"
        ? SHELL_THEME.error
        : panel.kind === "success"
            ? SHELL_THEME.success
            : SHELL_THEME.muted;
    for (const line of panel.lines) {
        process.stdout.write(`  ${render(line)}\n`);
    }
};
const hasGitHubAuthConfigured = () => {
    if (cachedGitHubAuthState !== undefined) {
        return cachedGitHubAuthState;
    }
    const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
    cachedGitHubAuthState = Boolean(envToken || (0, githubCliAuth_1.readGitHubCliToken)());
    return cachedGitHubAuthState;
};
const printSectionTitle = (title) => {
    process.stdout.write(`\n${SHELL_THEME.section(title)}\n`);
};
const printCommandList = (entries, prefix = "/", includeSummary = true) => {
    for (const entry of entries) {
        const label = `${prefix}${entry.name}`;
        if (!includeSummary || !entry.summary) {
            process.stdout.write(`  ${SHELL_THEME.command(label)}\n`);
            continue;
        }
        process.stdout.write(`  ${SHELL_THEME.command(label.padEnd(18))} ${SHELL_THEME.muted(entry.summary)}\n`);
    }
};
const printRootQuickStart = () => {
    process.stdout.write(`${SHELL_THEME.brand(SHELL_BRAND)}\n`);
    process.stdout.write(`${SHELL_THEME.muted("ilu interactive urdf shell")}\n`);
    process.stdout.write(`${SHELL_THEME.muted(ROOT_GUIDANCE)}\n`);
};
const printRootOptions = () => {
    printSectionTitle("start");
    process.stdout.write(`  ${SHELL_THEME.muted("paste owner/repo or drop a local folder/file first")}\n`);
    printSectionTitle("helpers");
    printCommandList(ROOT_TASKS);
    printSectionTitle("system");
    printCommandList(SHELL_BUILTIN_COMMANDS);
    for (const section of commandCatalog_1.CLI_HELP_SECTIONS) {
        printSectionTitle(section.title.toLowerCase());
        printCommandList(section.commands.map((commandName) => ({
            name: commandName,
            summary: "",
        })), "/", false);
    }
};
const printRootTaskOptions = (task) => {
    printSectionTitle(`/${task}`);
    process.stdout.write(`  ${SHELL_THEME.muted(getRootTaskSummary(task))}\n`);
    printSectionTitle("start");
    printCommandList(getRootTaskActionDefinitions(task));
    printSectionTitle("actions");
    printCommandList([
        { name: "back", summary: "Return to the main task menu." },
        { name: "help", summary: "Show the current task options again." },
        ...SHELL_BUILTIN_COMMANDS.filter((entry) => entry.name !== "help"),
    ]);
};
const getSlashAliasesForCommand = (command) => SESSION_SLASH_ALIASES[command] ?? {};
const getOptionSpecByKey = (session, key) => session.spec.options.find((option) => option.flag === `--${key}`);
const getPreferredSlashName = (session, key) => {
    const alias = Object.entries(getSlashAliasesForCommand(session.command)).find(([, target]) => target === key)?.[0];
    return alias ?? key;
};
const getSlashDisplayName = (session, key) => `/${getPreferredSlashName(session, key)}`;
const getShellCommandSummary = (command) => COMMAND_SUMMARY_OVERRIDES[command] ?? cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME[command].summary;
const getRootTaskSummary = (task) => ROOT_TASKS.find((entry) => entry.name === task)?.summary ?? "Task flow";
const getRootTaskActionDefinitions = (task) => ROOT_TASK_ACTIONS[task];
const getSessionSourceValue = (session, keys) => {
    for (const key of keys) {
        const value = session.args.get(key);
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }
    return null;
};
const buildSessionHeadline = (session) => {
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
const findRootTaskAction = (task, slashCommand) => getRootTaskActionDefinitions(task).find((entry) => entry.name === slashCommand);
const getOptionOrderRank = (session, key) => {
    const customOrder = SESSION_OPTION_ORDER[session.command] ?? [];
    const customIndex = customOrder.indexOf(key);
    return customIndex === -1 ? Number.MAX_SAFE_INTEGER : customIndex;
};
const getOptionSummary = (session, key, option) => {
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
const getRequiredKeys = (session) => new Set(session.spec.requiredAlternatives.flat());
const getSatisfiedRequiredKeyCount = (session, alternative) => alternative.filter((key) => session.args.has(key)).length;
const hasStartedRequiredWorkflow = (session) => session.spec.requiredAlternatives.some((alternative) => getSatisfiedRequiredKeyCount(session, alternative) > 0);
const getStarterSteps = (session) => {
    const startersBySignature = new Map();
    for (const alternative of session.spec.requiredAlternatives) {
        const orderedAlternative = [...alternative].sort((left, right) => getOptionOrderRank(session, left) - getOptionOrderRank(session, right));
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
const getOptionPriority = (session, key) => {
    const highlightedKeys = new Set((session.spec.requiredAlternatives.length > 1 && !hasStartedRequiredWorkflow(session)
        ? getStarterSteps(session)
        : getRequirementStatus(session).nextSteps).flat());
    if (highlightedKeys.has(key) || (highlightedKeys.size === 0 && getRequiredKeys(session).has(key))) {
        return "required";
    }
    if (ADVANCED_OPTION_KEYS.has(key)) {
        return "advanced";
    }
    return "common";
};
const getSessionOptionEntries = (session) => {
    const appearanceOrder = new Map(session.spec.options.map((option, index) => [option.flag.slice(2), index]));
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
const formatSlashSequence = (session, keys) => keys.map((key) => getSlashDisplayName(session, key)).join(" + ");
const formatStatusTag = (label) => {
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
const getRequirementStatus = (session) => {
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
    const nextStepsBySignature = new Map();
    for (const alternative of session.spec.requiredAlternatives) {
        const missing = [...alternative.filter((key) => !session.args.has(key))].sort((left, right) => getOptionOrderRank(session, left) - getOptionOrderRank(session, right));
        if (missing.length === 0) {
            return { ready: true, nextSteps: [] };
        }
        const satisfiedCount = alternative.length - missing.length;
        if (satisfiedCount > bestSatisfiedCount ||
            (satisfiedCount === bestSatisfiedCount && missing.length < bestMissingCount)) {
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
const printSessionStatus = (session) => {
    const requirementStatus = getRequirementStatus(session);
    process.stdout.write("\n");
    process.stdout.write(requirementStatus.ready
        ? `${formatStatusTag("ready")} ${SHELL_THEME.command("/run")}\n`
        : `${formatStatusTag("next")} ${requirementStatus.nextSteps.map((step) => SHELL_THEME.command(formatSlashSequence(session, step))).join(SHELL_THEME.muted(" or "))}\n`);
    process.stdout.write(`${formatStatusTag("flow")} ${SHELL_THEME.command(buildSessionHeadline(session))}\n`);
};
const printSessionPreview = (session) => {
    printSectionTitle("cmd");
    process.stdout.write(`  ${SHELL_THEME.command(buildCommandPreview(session.command, session.args))}\n`);
    if (session.args.size > 0) {
        printSectionTitle("values");
        for (const [key, value] of session.args.entries()) {
            const renderedValue = value === true ? "enabled" : quoteForPreview(String(value));
            process.stdout.write(`  ${SHELL_THEME.command(getSlashDisplayName(session, key).padEnd(18))} ${renderedValue}\n`);
        }
    }
    const requirementStatus = getRequirementStatus(session);
    printSectionTitle(requirementStatus.ready ? "ready" : "next");
    if (requirementStatus.ready) {
        process.stdout.write(`  ${SHELL_THEME.command("/run")}\n`);
        return;
    }
    for (const step of requirementStatus.nextSteps) {
        process.stdout.write(`  ${SHELL_THEME.command(formatSlashSequence(session, step))}\n`);
    }
};
const printSessionOptions = (session) => {
    const entries = getSessionOptionEntries(session);
    const requiredEntries = entries.filter((entry) => entry.priority === "required");
    const commonEntries = entries.filter((entry) => entry.priority === "common");
    const advancedEntries = entries.filter((entry) => entry.priority === "advanced");
    printSectionTitle(`/${session.label}`);
    process.stdout.write(`  ${SHELL_THEME.muted(getShellCommandSummary(session.command))}\n`);
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
    printSessionStatus(session);
};
const parseSlashInput = (input) => {
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
const clearMutuallyExclusiveArgs = (session, key) => {
    const groups = MUTUALLY_EXCLUSIVE_OPTION_GROUPS[session.command] ?? [];
    for (const group of groups) {
        if (!group.includes(key)) {
            continue;
        }
        for (const sibling of group) {
            if (sibling !== key) {
                session.args.delete(sibling);
            }
        }
    }
};
const decodeShellEscapes = (value) => {
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
const stripMatchingQuotes = (value) => {
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
        return value.slice(1, -1);
    }
    return value;
};
const normalizeShellInput = (rawValue) => decodeShellEscapes(stripMatchingQuotes(rawValue.trim()));
const normalizeFilesystemInput = (rawValue) => {
    const normalized = normalizeShellInput(rawValue);
    if (normalized.startsWith("~")) {
        return path.join(process.env.HOME ?? "", normalized.slice(1));
    }
    return normalized;
};
const looksLikeFilesystemSeed = (rawValue) => {
    const normalized = normalizeFilesystemInput(rawValue);
    return (normalized.startsWith("/") ||
        normalized.startsWith("./") ||
        normalized.startsWith("../") ||
        normalized.startsWith("~/") ||
        normalized.includes(path.sep));
};
const detectLocalPathDrop = (rawValue) => {
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
        };
    }
    catch {
        return null;
    }
};
const detectGitHubReferenceInput = (rawValue) => {
    const normalized = normalizeShellInput(rawValue);
    if (!normalized ||
        normalized.startsWith("/") ||
        normalized.startsWith("./") ||
        normalized.startsWith("../") ||
        normalized.startsWith("~/") ||
        detectLocalPathDrop(rawValue) ||
        /^[A-Za-z]:[\\/]/.test(normalized)) {
        return null;
    }
    return (0, githubRepositoryInspection_1.parseGitHubRepositoryReference)(normalized) ? normalized : null;
};
const isLocalFilesystemKey = (session, key) => {
    if (["local", "urdf", "xacro", "left", "right", "out", "root", "python", "wheel"].includes(key)) {
        return true;
    }
    if (key !== "path") {
        return false;
    }
    return session.command === "load-source" || session.command === "urdf-to-usd";
};
const validateOptionValue = (session, key, rawValue) => {
    const trimmed = key === "github"
        ? normalizeShellInput(rawValue)
        : isLocalFilesystemKey(session, key)
            ? normalizeFilesystemInput(rawValue)
            : rawValue.trim();
    if (!trimmed) {
        return null;
    }
    if (key === "github") {
        return (0, githubRepositoryInspection_1.parseGitHubRepositoryReference)(trimmed) ? trimmed : null;
    }
    return trimmed;
};
const getPendingValuePrompt = (session, key, slashName) => {
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
const printPendingValuePrompt = (pending) => {
    process.stdout.write(`\n${SHELL_THEME.section("input")}\n`);
    process.stdout.write(`${SHELL_THEME.command(pending.title)}\n`);
    if (pending.examples.length === 1) {
        process.stdout.write(`${SHELL_THEME.muted(`example: ${pending.examples[0]}`)}\n`);
    }
    else if (pending.examples.length > 1) {
        process.stdout.write(`${SHELL_THEME.muted("examples:")}\n`);
        for (const example of pending.examples) {
            process.stdout.write(`  ${SHELL_THEME.muted(example)}\n`);
        }
    }
    for (const note of pending.notes) {
        process.stdout.write(`${SHELL_THEME.warning(note)}\n`);
    }
};
const isPathLikeOption = (session, key) => getOptionSpecByKey(session, key)?.isFilesystemPath === true;
const setSessionValue = (session, key, rawValue, feedback) => {
    const value = validateOptionValue(session, key, rawValue);
    if (!value) {
        if (key === "github") {
            pushFeedback(feedback, "error", "Expected owner/repo or a GitHub repository URL.");
        }
        else {
            pushFeedback(feedback, "error", `Invalid value for --${key}.`);
        }
        return false;
    }
    clearMutuallyExclusiveArgs(session, key);
    session.args.set(key, value);
    pushFeedback(feedback, "success", `[set] --${key} ${quoteForPreview(value)}`);
    return true;
};
const toggleSessionFlag = (session, key, feedback) => {
    if (session.args.get(key) === true) {
        session.args.delete(key);
        pushFeedback(feedback, "warning", `[unset] --${key}`);
        return;
    }
    session.args.set(key, true);
    pushFeedback(feedback, "success", `[on] --${key}`);
};
const getLastUrdfMessage = (state) => state.lastUrdfPath ? `last ${state.lastUrdfPath}` : "no remembered URDF yet";
const printLastUrdf = (state) => {
    process.stdout.write(`${SHELL_THEME.muted(getLastUrdfMessage(state))}\n`);
};
const updateRememberedUrdfPath = (state, session) => {
    const directUrdfPath = session.args.get("urdf");
    if (typeof directUrdfPath === "string" && directUrdfPath.trim().length > 0) {
        state.lastUrdfPath = directUrdfPath;
        return;
    }
    const outPath = session.args.get("out");
    if (typeof outPath === "string" && URDF_OUTPUT_COMMANDS.has(session.command)) {
        state.lastUrdfPath = outPath;
    }
};
const getFollowUpSuggestionMessage = (state, command) => {
    if ((command === "load-source" || command === "xacro-to-urdf") && state.lastUrdfPath) {
        return `[next] /check /inspect /fix\nusing ${state.lastUrdfPath}`;
    }
    if (command === "inspect-repo") {
        return "[next] /open or /fix";
    }
    if (state.lastUrdfPath) {
        return `remembered ${state.lastUrdfPath}`;
    }
    return null;
};
const printFollowUpSuggestions = (state, command) => {
    const message = getFollowUpSuggestionMessage(state, command);
    if (!message) {
        return;
    }
    for (const line of message.split("\n")) {
        if (line.startsWith("[next]")) {
            process.stdout.write(`${SHELL_THEME.accent(line)}\n`);
        }
        else {
            process.stdout.write(`${SHELL_THEME.muted(line)}\n`);
        }
    }
};
const executeCliCommand = (command, args) => {
    const preview = buildCommandPreview(command, args);
    const argv = [CLI_ENTRY_PATH, command];
    for (const [key, value] of args.entries()) {
        if (value === true) {
            argv.push(`--${key}`);
            continue;
        }
        argv.push(`--${key}`, String(value));
    }
    const result = (0, node_child_process_1.spawnSync)(process.execPath, argv, {
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
const parseExecutionJson = (execution) => {
    if (execution.status !== 0) {
        return null;
    }
    try {
        return JSON.parse(execution.stdout);
    }
    catch {
        return null;
    }
};
const formatCount = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
const buildPreviewErrorPanel = (title, execution) => {
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
const summarizeRepositoryPreview = (session, payload) => {
    const sourceLabel = payload.repositoryUrl ??
        (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : payload.inspectedPath ?? "source");
    const lines = [`source ${sourceLabel}`];
    if (payload.candidateCount === 0) {
        lines.push("no URDF or XACRO entrypoints found");
        lines.push(session.label === "open" ? "use /entry if you already know the target path" : "use /open and /entry if you want to force a target path");
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
        const details = [candidate.inspectionMode === "xacro-source" ? "xacro" : "urdf"];
        if ((candidate.unresolvedMeshReferenceCount ?? 0) > 0) {
            details.push(`${candidate.unresolvedMeshReferenceCount} missing mesh refs`);
        }
        if ((candidate.xacroArgs?.length ?? 0) > 0) {
            details.push(`${candidate.xacroArgs?.length} xacro args`);
        }
        lines.push(`${index + 1}. ${candidate.path}${details.length > 0 ? `  ${details.join("  ")}` : ""}`);
    }
    if (payload.candidateCount > 3) {
        lines.push(`+${payload.candidateCount - 3} more`);
    }
    lines.push(session.label === "open"
        ? "next /run to load the best match or /entry to override"
        : "next /open to load it, or /path to narrow the repo");
    return {
        title: "preview",
        kind: "info",
        lines,
    };
};
const summarizeHealthPreview = (payload, urdfPath) => {
    const lines = [`source ${quoteForPreview(urdfPath)}`];
    lines.push(payload.ok
        ? "looks healthy"
        : `${formatCount(payload.summary.errors, "error")}, ${formatCount(payload.summary.warnings, "warning")}, ${formatCount(payload.summary.infos, "info")}`);
    if (payload.orientationGuess?.likelyUpAxis && payload.orientationGuess?.likelyForwardAxis) {
        lines.push(`orientation likely ${payload.orientationGuess.likelyUpAxis}-up / ${payload.orientationGuess.likelyForwardAxis}-forward`);
    }
    for (const finding of payload.findings.slice(0, 2)) {
        const prefix = finding.context ? `${finding.context}: ` : "";
        lines.push(`${finding.level} ${prefix}${finding.message}`);
    }
    if (payload.findings.length > 2) {
        lines.push(`+${payload.findings.length - 2} more findings`);
    }
    lines.push("next /fix or /convert if you want changes");
    return {
        title: "health",
        kind: payload.ok ? "success" : "info",
        lines,
    };
};
const summarizeAnalysisPreview = (payload, urdfPath) => {
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
    lines.push(`${formatCount(payload.linkNames.length, "link")}  ${formatCount(jointCount, "joint")}  ${formatCount(payload.meshReferences.length, "mesh ref")}`);
    if ((payload.sensors?.length ?? 0) > 0) {
        lines.push(`${formatCount(payload.sensors?.length ?? 0, "sensor")}`);
    }
    if (payload.rootLinks.length > 0) {
        lines.push(payload.rootLinks.length === 1
            ? `root ${payload.rootLinks[0]}`
            : `${formatCount(payload.rootLinks.length, "root link")}`);
    }
    lines.push("next /check or /fix if you want deeper review");
    return {
        title: "preview",
        kind: "info",
        lines,
    };
};
const buildAutoPreviewPanel = (state, session, changedKey) => {
    let previewCommand = null;
    const previewArgs = new Map();
    if (session.command === "load-source" && (changedKey === "github" || changedKey === "path")) {
        const github = session.args.get("github");
        const sourcePath = session.args.get("path");
        if (typeof github === "string" && github.trim().length > 0) {
            previewCommand = "inspect-repo";
            previewArgs.set("github", github);
        }
        else if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
            const localPath = detectLocalPathDrop(sourcePath);
            if (localPath?.isDirectory) {
                previewCommand = "inspect-repo";
                previewArgs.set("local", sourcePath);
            }
            else if (localPath?.isUrdfFile) {
                previewCommand = "health-check";
                previewArgs.set("urdf", sourcePath);
            }
        }
    }
    else if (session.command === "inspect-repo" &&
        (changedKey === "github" || changedKey === "local")) {
        const github = session.args.get("github");
        const local = session.args.get("local");
        if (typeof github === "string" && github.trim().length > 0) {
            previewCommand = "inspect-repo";
            previewArgs.set("github", github);
        }
        else if (typeof local === "string" && local.trim().length > 0) {
            previewCommand = "inspect-repo";
            previewArgs.set("local", local);
        }
    }
    else if ((session.command === "health-check" || session.command === "analyze") &&
        changedKey === "urdf") {
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
        const payload = parseExecutionJson(execution);
        return payload ? summarizeRepositoryPreview(session, payload) : buildPreviewErrorPanel("preview", execution);
    }
    if (previewCommand === "health-check") {
        const payload = parseExecutionJson(execution);
        const urdfPath = String(previewArgs.get("urdf") || "");
        if (payload && urdfPath) {
            state.lastUrdfPath = urdfPath;
            return summarizeHealthPreview(payload, urdfPath);
        }
        return buildPreviewErrorPanel("health", execution);
    }
    if (previewCommand === "analyze") {
        const payload = parseExecutionJson(execution);
        const urdfPath = String(previewArgs.get("urdf") || "");
        if (payload && urdfPath) {
            state.lastUrdfPath = urdfPath;
            return summarizeAnalysisPreview(payload, urdfPath);
        }
        return buildPreviewErrorPanel("preview", execution);
    }
    return null;
};
const executeSessionCommand = (state, session) => {
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
const printSessionCommandExecution = (execution, command) => {
    process.stdout.write(`\n${formatStatusTag("cmd")} ${SHELL_THEME.command(execution.preview)}\n`);
    if (execution.stdout) {
        process.stdout.write(execution.stdout);
    }
    if (execution.stderr) {
        process.stderr.write(execution.stderr);
    }
    if (execution.status !== 0) {
        process.stderr.write(`[${command}] exited with status ${execution.status}\n`);
        return;
    }
    if (execution.followUp) {
        for (const line of execution.followUp.split("\n")) {
            if (line.startsWith("[next]")) {
                process.stdout.write(`${SHELL_THEME.accent(line)}\n`);
            }
            else {
                process.stdout.write(`${SHELL_THEME.muted(line)}\n`);
            }
        }
    }
};
const createSession = (command, state, label = command, feedback) => {
    const session = {
        command,
        label,
        spec: cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME[command],
        args: new Map(),
        pending: null,
    };
    if (state.lastUrdfPath && getOptionSpecByKey(session, "urdf")) {
        session.args.set("urdf", state.lastUrdfPath);
        pushFeedback(feedback, "info", `using ${state.lastUrdfPath}`);
    }
    return session;
};
const resolveSessionSlashTarget = (session, slashCommand) => {
    const aliases = getSlashAliasesForCommand(session.command);
    const key = aliases[slashCommand] ?? slashCommand;
    const option = getOptionSpecByKey(session, key);
    return option ? { key, option } : null;
};
const listAvailableSlashCommands = (state) => {
    if (state.session) {
        return [
            ...new Set([
                ...SESSION_BUILTIN_COMMANDS.map((entry) => entry.name),
                ...SESSION_SYSTEM_MENU_ENTRIES.map((entry) => entry.name),
                ...getSessionOptionEntries(state.session).map((entry) => entry.name),
            ]),
        ];
    }
    if (state.rootTask) {
        return [
            ...new Set([
                ...getRootTaskActionDefinitions(state.rootTask).map((entry) => entry.name),
                "back",
                "help",
                ...SHELL_BUILTIN_COMMANDS.filter((entry) => entry.name !== "help").map((entry) => entry.name),
            ]),
        ];
    }
    return [
        ...new Set([
            ...ROOT_TASKS.map((entry) => entry.name),
            ...SHELL_BUILTIN_COMMANDS.map((entry) => entry.name),
            ...commandCatalog_1.CLI_HELP_SECTIONS.flatMap((section) => section.commands),
        ]),
    ];
};
const completePathFragment = (fragment) => {
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
            const rendered = raw.startsWith("~") && fullPath.startsWith(process.env.HOME ?? "")
                ? `~${fullPath.slice((process.env.HOME ?? "").length)}`
                : fullPath;
            return entry.isDirectory() ? `${rendered}/` : rendered;
        });
    }
    catch {
        return [];
    }
};
const createCompleter = (state) => {
    return (line) => {
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
        const matches = completePathFragment(parsed.inlineValue).map((match) => `/${parsed.slashCommand} ${match}`);
        return [matches, line];
    };
};
const openPendingForSession = (session, pending) => {
    if (!pending) {
        return;
    }
    if (pending.onlyIfMissing && session.args.has(pending.key)) {
        return;
    }
    session.pending = getPendingValuePrompt(session, pending.key, pending.slashName);
};
const inferFreeformSessionTarget = (session, rawValue) => {
    const githubValue = detectGitHubReferenceInput(rawValue);
    if (githubValue &&
        getOptionSpecByKey(session, "github") &&
        !session.args.has("github") &&
        !session.args.has("path") &&
        !session.args.has("local")) {
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
    if (localPath.isUrdfFile &&
        getOptionSpecByKey(session, "urdf") &&
        !session.args.has("urdf")) {
        return {
            key: "urdf",
            slashName: "file",
            value: localPath.inputPath,
        };
    }
    return null;
};
const inferFreeformRootPlan = (state, rawValue) => {
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
                label: "check",
                key: "urdf",
                slashName: "file",
                value: localPath.inputPath,
            };
        }
        if (localPath?.isXacroFile) {
            return {
                rootTask: "convert",
                command: "xacro-to-urdf",
                label: "convert",
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
const shouldTreatAsSlashInput = (rawValue, state) => {
    const trimmed = rawValue.trim();
    if (!trimmed.startsWith("/")) {
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
const startRootTaskAction = (task, action, state, feedback) => {
    state.rootTask = task;
    state.session = createSession(action.command, state, action.sessionLabel, feedback);
    if (state.session) {
        openPendingForSession(state.session, action.openPending);
    }
};
const handleRootSlashCommand = (slashCommand, state, close) => {
    if (!slashCommand || slashCommand === "help") {
        printRootOptions();
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
        (0, cliUpdate_1.runUpdateCommand)();
        return;
    }
    if (slashCommand === "last") {
        printLastUrdf(state);
        return;
    }
    if (ROOT_TASKS.some((entry) => entry.name === slashCommand)) {
        state.rootTask = slashCommand;
        printRootTaskOptions(state.rootTask);
        return;
    }
    if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
        process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
        process.stdout.write(`${ROOT_GUIDANCE}\n`);
        return;
    }
    state.rootTask = null;
    const feedback = [];
    state.session = createSession(slashCommand, state, slashCommand, feedback);
    flushFeedback(feedback);
    printSessionOptions(state.session);
};
const handleRootTaskSlashCommand = (slashCommand, state, close) => {
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
        (0, cliUpdate_1.runUpdateCommand)();
        return;
    }
    if (slashCommand === "last") {
        printLastUrdf(state);
        return;
    }
    if (ROOT_TASKS.some((entry) => entry.name === slashCommand)) {
        state.rootTask = slashCommand;
        printRootTaskOptions(state.rootTask);
        return;
    }
    const action = findRootTaskAction(task, slashCommand);
    if (action) {
        const feedback = [];
        startRootTaskAction(task, action, state, feedback);
        flushFeedback(feedback);
        if (state.session?.pending) {
            printPendingValuePrompt(state.session.pending);
            return;
        }
        if (state.session) {
            printSessionOptions(state.session);
            return;
        }
    }
    if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
        process.stderr.write(`Unknown helper command: /${slashCommand}\n`);
        return;
    }
    const feedback = [];
    state.rootTask = null;
    state.session = createSession(slashCommand, state, slashCommand, feedback);
    flushFeedback(feedback);
    printSessionOptions(state.session);
};
const handleSessionSlashCommand = (slashCommand, inlineValue, state) => {
    const session = state.session;
    if (!session) {
        return;
    }
    if (!slashCommand || slashCommand === "help") {
        printSessionOptions(session);
        return;
    }
    if (slashCommand === "back") {
        state.session = null;
        process.stdout.write(`${SHELL_THEME.muted(state.rootTask ? `back to /${state.rootTask}` : "back to tasks")}\n`);
        return;
    }
    if (slashCommand === "reset") {
        const feedback = [];
        state.session = createSession(session.command, state, session.label, feedback);
        flushFeedback(feedback);
        printSessionOptions(state.session);
        return;
    }
    if (slashCommand === "show") {
        printSessionPreview(session);
        return;
    }
    if (slashCommand === "run") {
        const requirementStatus = getRequirementStatus(session);
        if (!requirementStatus.ready) {
            process.stderr.write(`${SHELL_THEME.warning("[missing]")} ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}\n`);
            return;
        }
        printSessionCommandExecution(executeSessionCommand(state, session), session.command);
        return;
    }
    if (slashCommand === "last") {
        printLastUrdf(state);
        return;
    }
    if (slashCommand === "update") {
        (0, cliUpdate_1.runUpdateCommand)();
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
        process.stderr.write(`Unknown helper command: /${slashCommand}\n`);
        return;
    }
    if (!target.option.valueHint) {
        const feedback = [];
        toggleSessionFlag(session, target.key, feedback);
        flushFeedback(feedback);
        printSessionStatus(session);
        return;
    }
    if (inlineValue) {
        const feedback = [];
        if (setSessionValue(session, target.key, inlineValue, feedback)) {
            session.pending = null;
            flushFeedback(feedback);
            printSessionStatus(session);
            return;
        }
        flushFeedback(feedback);
        return;
    }
    session.pending = getPendingValuePrompt(session, target.key, slashCommand);
    printPendingValuePrompt(session.pending);
};
const handlePendingValue = (input, state) => {
    const session = state.session;
    if (!session?.pending) {
        return;
    }
    const feedback = [];
    if (setSessionValue(session, session.pending.key, input, feedback)) {
        session.pending = null;
        flushFeedback(feedback);
        printSessionStatus(session);
        return;
    }
    flushFeedback(feedback);
    printPendingValuePrompt(session.pending);
};
const applyFreeformInputToSession = (session, rawValue, feedback) => {
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
const applyFreeformInputToRootState = (state, rawValue, feedback) => {
    const plan = inferFreeformRootPlan(state, rawValue);
    if (!plan) {
        return null;
    }
    state.rootTask = plan.rootTask;
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
const ROOT_SYSTEM_MENU_ENTRIES = SHELL_BUILTIN_COMMANDS.map((entry) => ({
    ...entry,
    kind: "system",
}));
const SESSION_SYSTEM_MENU_ENTRIES = [
    { name: "last", summary: "Show the last remembered URDF path.", kind: "system" },
    { name: "clear", summary: "Clear the current shell view.", kind: "system" },
    { name: "exit", summary: "Exit the interactive shell.", kind: "system" },
    { name: "quit", summary: "Exit the interactive shell.", kind: "system" },
];
const getRootTaskMenuEntries = (task) => [
    ...getRootTaskActionDefinitions(task).map((entry) => ({
        name: entry.name,
        summary: entry.summary,
        kind: "action",
    })),
    { name: "back", summary: "Return to the main task menu.", kind: "system" },
    { name: "help", summary: "Show the current task options again.", kind: "system" },
    ...ROOT_SYSTEM_MENU_ENTRIES.filter((entry) => entry.name !== "help"),
];
const getRootMenuEntries = (state) => {
    if (state.rootTask) {
        return getRootTaskMenuEntries(state.rootTask);
    }
    const seen = new Set();
    const entries = [];
    const addEntry = (entry) => {
        if (seen.has(entry.name)) {
            return;
        }
        seen.add(entry.name);
        entries.push(entry);
    };
    for (const entry of ROOT_TASKS) {
        addEntry({
            name: entry.name,
            summary: entry.summary,
            kind: "task",
        });
    }
    for (const entry of ROOT_SYSTEM_MENU_ENTRIES) {
        addEntry(entry);
    }
    for (const section of commandCatalog_1.CLI_HELP_SECTIONS) {
        for (const commandName of section.commands) {
            addEntry({
                name: commandName,
                summary: getShellCommandSummary(commandName),
                kind: "flow",
            });
        }
    }
    return entries;
};
const getSessionMenuEntries = (session) => {
    const entries = getSessionOptionEntries(session).map((entry) => ({
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
const filterMenuEntries = (entries, query) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return entries;
    }
    const startsWithMatches = entries.filter((entry) => entry.name.startsWith(normalizedQuery));
    if (startsWithMatches.length > 0) {
        return startsWithMatches;
    }
    const includesMatches = entries.filter((entry) => entry.name.includes(normalizedQuery));
    return includesMatches.length > 0 ? includesMatches : entries;
};
const getSlashMenuEntries = (state, input) => {
    if (!shouldTreatAsSlashInput(input.trimStart(), state)) {
        return [];
    }
    const parsed = parseSlashInput(input.trimStart());
    if (!parsed || parsed.inlineValue) {
        return [];
    }
    return filterMenuEntries(state.session ? getSessionMenuEntries(state.session) : getRootMenuEntries(state), parsed.slashCommand);
};
const pushTimelineEntry = (view, text) => {
    view.timeline = [...view.timeline.slice(-7), { text }];
};
const setNoticeFromFeedback = (view, feedback) => {
    if (feedback.length === 0) {
        view.notice = null;
        return;
    }
    view.notice = {
        kind: feedback[feedback.length - 1]?.kind ?? "info",
        text: feedback.map((entry) => entry.text).join("  "),
    };
};
const truncateText = (value, width) => {
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
const getMenuWindow = (entries, selectedIndex, maxVisible) => {
    if (entries.length === 0) {
        return { selectedIndex: 0, start: 0, visible: [] };
    }
    const normalizedSelectedIndex = clamp(selectedIndex, 0, entries.length - 1);
    const visibleCount = clamp(maxVisible, 1, entries.length);
    const start = clamp(normalizedSelectedIndex - Math.floor(visibleCount / 2), 0, Math.max(entries.length - visibleCount, 0));
    return {
        selectedIndex: normalizedSelectedIndex,
        start,
        visible: entries.slice(start, start + visibleCount),
    };
};
const buildSessionPreviewText = (session) => {
    const lines = [buildCommandPreview(session.command, session.args)];
    if (session.args.size > 0) {
        for (const [key, value] of session.args.entries()) {
            lines.push(`${getSlashDisplayName(session, key)}${formatInlineValue(value === true ? "enabled" : String(value))}`);
        }
    }
    const requirementStatus = getRequirementStatus(session);
    lines.push(requirementStatus.ready
        ? "ready /run"
        : `next ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}`);
    return lines.join("\n");
};
const buildExecutionPanelText = (execution, command) => {
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
const renderNotice = (notice) => {
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
const renderMenuEntry = (entry, selected, width) => {
    const badge = entry.kind === "task"
        ? "top"
        : entry.kind === "flow"
            ? "cmd"
            : entry.kind === "option"
                ? "set"
                : entry.kind === "action"
                    ? "act"
                    : "sys";
    const label = `/${entry.name}`;
    const left = `${selected ? ">" : " "} ${truncateText(label, 24).padEnd(24)} `;
    const availableSummaryWidth = Math.max(12, width - left.length - badge.length - 3);
    const summary = truncateText(entry.summary, availableSummaryWidth);
    const line = `${left}${summary} ${badge}`;
    return selected ? SHELL_THEME.selected(line) : `${SHELL_THEME.command(left)}${SHELL_THEME.muted(`${summary} ${badge}`)}`;
};
const getPromptPlaceholder = (state) => {
    if (state.session?.pending) {
        return state.session.pending.examples[0] ?? state.session.pending.title;
    }
    if (!state.session && state.rootTask) {
        switch (state.rootTask) {
            case "open":
                return "paste owner/repo or drop a local folder, .urdf, or .xacro";
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
        return "paste owner/repo, drop a folder or .urdf, or type /";
    }
    const requirementStatus = getRequirementStatus(state.session);
    if (requirementStatus.ready) {
        return "type /run";
    }
    return requirementStatus.nextSteps
        .map((step) => formatSlashSequence(state.session, step))
        .join(" or ");
};
const renderTtyShell = (state, view) => {
    const columns = process.stdout.columns ?? 100;
    const rows = process.stdout.rows ?? 24;
    const menuEntries = getSlashMenuEntries(state, view.input);
    const menuWindow = getMenuWindow(menuEntries, view.menuIndex, Math.max(4, Math.min(8, rows - 16)));
    view.menuIndex = menuWindow.selectedIndex;
    const lines = [];
    lines.push(`${SHELL_THEME.brand(SHELL_BRAND)} ${SHELL_THEME.muted("ilu interactive urdf shell")}`);
    lines.push(state.session
        ? SHELL_THEME.muted(`helper /${state.session.label}  arrows move  tab completes  enter selects  ctrl+c exits`)
        : state.rootTask
            ? SHELL_THEME.muted(`task /${state.rootTask}  paste a source or type /  tab completes  ctrl+c exits`)
            : SHELL_THEME.muted("paste owner/repo or drop a local path  / shows helpers  tab completes  ctrl+c exits"));
    if (view.notice) {
        lines.push(renderNotice(view.notice));
    }
    if (view.timeline.length > 0) {
        lines.push("");
        lines.push(SHELL_THEME.section("recent"));
        for (const entry of view.timeline.slice(-6)) {
            lines.push(`  ${SHELL_THEME.command(entry.text)}`);
        }
    }
    lines.push("");
    lines.push(SHELL_THEME.section(state.session ? "current" : state.rootTask ? `/${state.rootTask}` : "start"));
    if (state.session) {
        const requirementStatus = getRequirementStatus(state.session);
        lines.push(requirementStatus.ready
            ? `  ${SHELL_THEME.success("ready")} ${SHELL_THEME.command("/run")}`
            : `  ${SHELL_THEME.accent("next")} ${SHELL_THEME.command(requirementStatus.nextSteps.map((step) => formatSlashSequence(state.session, step)).join(" or "))}`);
        lines.push(`  ${SHELL_THEME.muted("flow")} ${SHELL_THEME.command(buildSessionHeadline(state.session))}`);
        if (state.session.pending) {
            lines.push(`  ${SHELL_THEME.muted("input")} ${SHELL_THEME.command(state.session.pending.title)}`);
        }
    }
    else if (state.rootTask) {
        lines.push(`  ${SHELL_THEME.muted(getRootTaskSummary(state.rootTask))}`);
        for (const entry of getRootTaskActionDefinitions(state.rootTask)) {
            lines.push(`  ${SHELL_THEME.command(`/${entry.name}`.padEnd(18))}${SHELL_THEME.muted(entry.summary)}`);
        }
    }
    else {
        lines.push(`  ${SHELL_THEME.muted("paste owner/repo or drop a local folder/file")}`);
        lines.push(`  ${SHELL_THEME.muted("/ opens extra helpers when you need them")}`);
    }
    if (view.output) {
        lines.push("");
        lines.push(SHELL_THEME.section(view.output.title));
        const renderOutputLine = view.output.kind === "error"
            ? SHELL_THEME.error
            : view.output.kind === "success"
                ? SHELL_THEME.success
                : SHELL_THEME.muted;
        for (const line of view.output.lines) {
            lines.push(`  ${renderOutputLine(truncateText(line, columns - 4))}`);
        }
    }
    lines.push("");
    const promptLabel = state.session ? formatSessionPrompt(state.session).trimEnd() : formatRootPrompt(state).trimEnd();
    const promptLineIndex = lines.length;
    const placeholder = view.input.length === 0 ? getPromptPlaceholder(state) : "";
    lines.push(`${SHELL_THEME.command(promptLabel)} ${view.input}${placeholder ? SHELL_THEME.muted(placeholder) : ""}`);
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
    }
    else if (view.input.startsWith("/")) {
        lines.push(SHELL_THEME.section("picker"));
        if (menuEntries.length === 0) {
            lines.push(`  ${SHELL_THEME.warning("no matches")}`);
        }
        else {
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
    process.stdout.write("\u001b[2J\u001b[H");
    process.stdout.write(lines.join("\n"));
    const linesBelowPrompt = lines.length - promptLineIndex - 1;
    if (linesBelowPrompt > 0) {
        process.stdout.write(`\u001b[${linesBelowPrompt}A`);
    }
    process.stdout.write("\r");
    process.stdout.write(`\u001b[${stripAnsi(`${promptLabel} ${view.input}`).length}C`);
};
const completeTtyPathInput = (input, state) => {
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
const completeSelectedSlashInput = (input, state, selectedIndex) => {
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
const runLineInteractiveShell = async (options = {}) => {
    const state = {
        session: null,
        rootTask: null,
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
    rl.setPrompt(formatRootPrompt(state));
    rl.prompt();
    for await (const line of rl) {
        const trimmed = line.trim();
        const session = state.session;
        const isSlashInput = shouldTreatAsSlashInput(line, state);
        if (session?.pending && !isSlashInput) {
            handlePendingValue(line, state);
        }
        else if (isSlashInput) {
            const parsed = parseSlashInput(trimmed);
            if (parsed) {
                if (session) {
                    handleSessionSlashCommand(parsed.slashCommand, parsed.inlineValue, state);
                }
                else if (state.rootTask) {
                    handleRootTaskSlashCommand(parsed.slashCommand, state, close);
                }
                else {
                    handleRootSlashCommand(parsed.slashCommand, state, close);
                }
            }
        }
        else if (!trimmed) {
            if (session) {
                printSessionStatus(session);
            }
            else if (state.rootTask) {
                printRootTaskOptions(state.rootTask);
            }
            else {
                process.stdout.write(`${SHELL_THEME.muted(ROOT_GUIDANCE)}\n`);
            }
        }
        else if (session) {
            const feedback = [];
            const applied = applyFreeformInputToSession(session, line, feedback);
            if (applied) {
                printSessionStatus(session);
                printOutputPanel(buildAutoPreviewPanel(state, applied.session, applied.key));
            }
            else {
                flushFeedback(feedback);
                process.stdout.write(`${SHELL_THEME.muted("type /, drop a local path, or paste owner/repo")}\n`);
            }
        }
        else {
            const feedback = [];
            const applied = applyFreeformInputToRootState(state, line, feedback);
            if (applied && state.session) {
                printSessionStatus(state.session);
                printOutputPanel(buildAutoPreviewPanel(state, applied.session, applied.key));
            }
            else {
                flushFeedback(feedback);
                process.stdout.write(`${SHELL_THEME.muted("type /, drop a local path, or paste owner/repo")}\n`);
            }
        }
        if (isClosed) {
            break;
        }
        rl.setPrompt(state.session ? formatSessionPrompt(state.session) : formatRootPrompt(state));
        rl.prompt();
    }
};
const runTtyInteractiveShell = async (options = {}) => {
    const state = {
        session: null,
        rootTask: null,
    };
    const view = {
        input: "",
        timeline: [],
        menuIndex: 0,
        notice: null,
        output: null,
    };
    let closed = false;
    const close = () => {
        closed = true;
    };
    const setInput = (nextInput) => {
        view.input = nextInput;
        const menuEntries = getSlashMenuEntries(state, view.input);
        view.menuIndex = menuEntries.length === 0 ? 0 : clamp(view.menuIndex, 0, menuEntries.length - 1);
    };
    const openSession = (command) => {
        const feedback = [];
        state.rootTask = null;
        state.session = createSession(command, state, command, feedback);
        setNoticeFromFeedback(view, feedback);
        view.output = null;
        pushTimelineEntry(view, `/${command}`);
    };
    const openRootTask = (task) => {
        state.rootTask = task;
        state.session = null;
        view.output = null;
        view.notice = { kind: "info", text: getRootTaskSummary(task) };
        pushTimelineEntry(view, `/${task}`);
    };
    const handleRootAction = (slashCommand) => {
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
            pushTimelineEntry(view, "/last");
            return true;
        }
        if (slashCommand === "update") {
            try {
                (0, cliUpdate_1.runUpdateCommand)();
                view.notice = { kind: "success", text: "ilu is up to date." };
            }
            catch (error) {
                view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
            }
            pushTimelineEntry(view, "/update");
            return true;
        }
        if (ROOT_TASKS.some((entry) => entry.name === slashCommand)) {
            openRootTask(slashCommand);
            return true;
        }
        if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
            view.notice = { kind: "error", text: `Unknown slash command: /${slashCommand}` };
            return true;
        }
        openSession(slashCommand);
        return true;
    };
    const handleRootTaskAction = (slashCommand) => {
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
            view.notice = { kind: "info", text: "back to tasks" };
            view.output = null;
            pushTimelineEntry(view, "/back");
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
            pushTimelineEntry(view, "/last");
            return true;
        }
        if (slashCommand === "update") {
            try {
                (0, cliUpdate_1.runUpdateCommand)();
                view.notice = { kind: "success", text: "ilu is up to date." };
            }
            catch (error) {
                view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
            }
            pushTimelineEntry(view, "/update");
            return true;
        }
        if (ROOT_TASKS.some((entry) => entry.name === slashCommand)) {
            openRootTask(slashCommand);
            return true;
        }
        const action = findRootTaskAction(task, slashCommand);
        if (action) {
            const feedback = [];
            startRootTaskAction(task, action, state, feedback);
            setNoticeFromFeedback(view, feedback);
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
            view.output = null;
            pushTimelineEntry(view, `/${slashCommand}`);
            return true;
        }
        if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
            view.notice = { kind: "error", text: `Unknown helper command: /${slashCommand}` };
            return true;
        }
        openSession(slashCommand);
        return true;
    };
    const handleSessionAction = (slashCommand, inlineValue) => {
        const session = state.session;
        if (!session) {
            return false;
        }
        if (!slashCommand || slashCommand === "help") {
            setInput("/");
            return true;
        }
        if (slashCommand === "back") {
            state.session = null;
            view.notice = { kind: "info", text: state.rootTask ? `back to /${state.rootTask}` : "back to tasks" };
            view.output = null;
            pushTimelineEntry(view, "/back");
            return true;
        }
        if (slashCommand === "reset") {
            const feedback = [];
            state.session = createSession(session.command, state, session.label, feedback);
            setNoticeFromFeedback(view, feedback);
            view.output = null;
            pushTimelineEntry(view, "/reset");
            return true;
        }
        if (slashCommand === "show") {
            view.output = createOutputPanel("current", buildSessionPreviewText(session));
            view.notice = { kind: "info", text: "showing current helper state" };
            pushTimelineEntry(view, "/show");
            return true;
        }
        if (slashCommand === "run") {
            const requirementStatus = getRequirementStatus(session);
            if (!requirementStatus.ready) {
                view.notice = {
                    kind: "error",
                    text: `[missing] ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}`,
                };
                return true;
            }
            const execution = executeSessionCommand(state, session);
            view.output = createOutputPanel(execution.status === 0 ? "result" : "error", buildExecutionPanelText(execution, session.command), execution.status === 0 ? "success" : "error");
            view.notice =
                execution.status === 0
                    ? { kind: "success", text: "run complete" }
                    : { kind: "error", text: `[${session.command}] exited with status ${execution.status}` };
            pushTimelineEntry(view, "/run");
            return true;
        }
        if (slashCommand === "last") {
            view.notice = { kind: "info", text: getLastUrdfMessage(state) };
            pushTimelineEntry(view, "/last");
            return true;
        }
        if (slashCommand === "update") {
            try {
                (0, cliUpdate_1.runUpdateCommand)();
                view.notice = { kind: "success", text: "ilu is up to date." };
            }
            catch (error) {
                view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
            }
            pushTimelineEntry(view, "/update");
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
            view.notice = { kind: "error", text: `Unknown helper command: /${slashCommand}` };
            return true;
        }
        if (!target.option.valueHint) {
            const feedback = [];
            toggleSessionFlag(session, target.key, feedback);
            setNoticeFromFeedback(view, feedback);
            view.output = null;
            pushTimelineEntry(view, `/${slashCommand} ${session.args.get(target.key) === true ? "on" : "off"}`);
            return true;
        }
        if (inlineValue) {
            const feedback = [];
            if (setSessionValue(session, target.key, inlineValue, feedback)) {
                session.pending = null;
                setNoticeFromFeedback(view, feedback);
                view.output = null;
                pushTimelineEntry(view, `/${slashCommand}${formatInlineValue(inlineValue)}`);
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
        view.output = null;
        return true;
    };
    const handlePendingInput = () => {
        const session = state.session;
        if (!session?.pending) {
            return;
        }
        const feedback = [];
        if (setSessionValue(session, session.pending.key, view.input, feedback)) {
            pushTimelineEntry(view, `/${session.pending.slashName}${formatInlineValue(view.input)}`);
            session.pending = null;
            setNoticeFromFeedback(view, feedback);
            view.output = null;
            return;
        }
        setNoticeFromFeedback(view, feedback);
    };
    const handleEnter = () => {
        const trimmed = view.input.trim();
        const isSlashInput = shouldTreatAsSlashInput(view.input, state);
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
                        }
                        else if (state.rootTask) {
                            handleRootTaskAction(selected.name);
                        }
                        else {
                            handleRootAction(selected.name);
                        }
                        setInput("");
                        return;
                    }
                }
            }
            if (state.session) {
                handleSessionAction(parsed.slashCommand, parsed.inlineValue);
            }
            else if (state.rootTask) {
                handleRootTaskAction(parsed.slashCommand);
            }
            else {
                handleRootAction(parsed.slashCommand);
            }
            setInput("");
            return;
        }
        if (trimmed.length === 0) {
            view.notice = {
                kind: "info",
                text: state.session || state.rootTask ? getPromptPlaceholder(state) : ROOT_GUIDANCE,
            };
            return;
        }
        if (state.session) {
            const feedback = [];
            const applied = applyFreeformInputToSession(state.session, view.input, feedback);
            if (applied) {
                const preview = buildAutoPreviewPanel(state, applied.session, applied.key);
                view.notice = preview
                    ? {
                        kind: preview.kind === "error" ? "error" : "info",
                        text: preview.kind === "error"
                            ? "preview failed"
                            : preview.title === "health"
                                ? "health preview ready"
                                : "preview ready",
                    }
                    : { kind: "info", text: buildSessionHeadline(applied.session) };
                view.output = preview;
                pushTimelineEntry(view, view.input.trim());
                setInput("");
                return;
            }
            setNoticeFromFeedback(view, feedback);
        }
        else {
            const feedback = [];
            const applied = applyFreeformInputToRootState(state, view.input, feedback);
            if (applied && state.session) {
                const preview = buildAutoPreviewPanel(state, applied.session, applied.key);
                view.notice = preview
                    ? {
                        kind: preview.kind === "error" ? "error" : "info",
                        text: preview.kind === "error"
                            ? "preview failed"
                            : preview.title === "health"
                                ? "health preview ready"
                                : "preview ready",
                    }
                    : { kind: "info", text: buildSessionHeadline(applied.session) };
                view.output = preview;
                pushTimelineEntry(view, view.input.trim());
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
        render();
    };
    const onKeypress = (input, key) => {
        if (closed) {
            return;
        }
        if ((key.ctrl && key.name === "c") || input === "\u0003") {
            close();
            return;
        }
        if (key.name === "return" || key.name === "enter") {
            handleEnter();
            render();
            return;
        }
        if (key.name === "up" || (key.shift && key.name === "tab")) {
            const menuEntries = getSlashMenuEntries(state, view.input);
            if (menuEntries.length > 0) {
                view.menuIndex = clamp(view.menuIndex - 1, 0, menuEntries.length - 1);
                render();
            }
            return;
        }
        if (key.name === "down") {
            const menuEntries = getSlashMenuEntries(state, view.input);
            if (menuEntries.length > 0) {
                view.menuIndex = clamp(view.menuIndex + 1, 0, menuEntries.length - 1);
                render();
            }
            return;
        }
        if (key.name === "tab") {
            const slashCompletion = completeSelectedSlashInput(view.input, state, view.menuIndex);
            if (slashCompletion) {
                setInput(slashCompletion);
                render();
                return;
            }
            const pathCompletion = completeTtyPathInput(view.input, state);
            if (pathCompletion) {
                setInput(pathCompletion.nextInput);
                view.notice = pathCompletion.notice;
                render();
            }
            return;
        }
        if (key.name === "escape") {
            if (view.input.startsWith("/")) {
                setInput("");
                render();
                return;
            }
            if (state.session?.pending) {
                state.session.pending = null;
                view.notice = { kind: "info", text: "input cancelled" };
                render();
            }
            return;
        }
        if (key.name === "backspace") {
            if (view.input.length > 0) {
                setInput(view.input.slice(0, -1));
                render();
            }
            return;
        }
        if (key.ctrl && key.name === "u") {
            setInput("");
            render();
            return;
        }
        if (input && !key.ctrl && !key.meta) {
            setInput(`${view.input}${input}`);
            if (view.input.startsWith("/")) {
                view.menuIndex = 0;
            }
            view.notice = null;
            render();
        }
    };
    process.stdout.on("resize", onResize);
    process.stdin.on("keypress", onKeypress);
    render();
    try {
        while (!closed) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }
    finally {
        process.stdout.off("resize", onResize);
        process.stdin.off("keypress", onKeypress);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\u001b[2J\u001b[H\n");
    }
};
const renderShellHelp = () => {
    return [
        "Start the i<3urdf interactive shell.",
        "",
        "Usage",
        "  ilu",
        "  ilu shell",
        "",
        "Inside the shell",
        "  owner/repo         Preview a GitHub repo immediately",
        "  ./robot.urdf       Run a quick health preview on a local URDF",
        "  ./robot-folder/    Preview a local repo or folder",
        "  /                  Open extra helpers under the prompt",
        "  up/down            Move through picker options",
        "  tab                Complete the selected option or path",
        "  enter              Select the highlighted option",
        "  ctrl+c             Exit immediately",
        "  esc                Close the picker or cancel a pending value",
        "  /check             Run health, validation, and orientation checks",
        "  /convert           Convert XACRO and URDF files into other formats",
        "  /fix               Repair mesh paths, mesh refs, and axis issues",
        "  /open              Explicitly load a repo, folder, or file as a working URDF",
        "  /inspect           Explicitly inspect a repo or URDF without loading it",
        "  /update            Install the latest ilu release",
        "  /show              Show the assembled command and next step",
        "  /run               Execute the assembled command",
        "  /back              Return to the root helper menu",
        "  /exit              Quit the shell",
    ].join("\n");
};
exports.renderShellHelp = renderShellHelp;
const runInteractiveShell = async (options = {}) => {
    if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
        await runTtyInteractiveShell(options);
        return;
    }
    await runLineInteractiveShell(options);
};
exports.runInteractiveShell = runInteractiveShell;

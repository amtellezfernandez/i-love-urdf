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
const ROOT_QUICK_START_COMMANDS = [
    "load-source",
    "inspect-repo",
    "health-check",
    "analyze",
];
const COMMAND_SUMMARY_OVERRIDES = {
    "load-source": "Load from GitHub, a local repo, or a local file.",
    "inspect-repo": "Inspect a repo before choosing the right entrypoint.",
    "health-check": "Check structure, axes, and orientation risks.",
    analyze: "Inspect structure, morphology, and mesh references.",
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
const ROOT_GUIDANCE = "type / for commands, /update for latest, ctrl+c to quit";
const formatRootPrompt = () => "/> ";
const formatSessionPrompt = (session) => session.pending ? `/${session.pending.slashName}> ` : `/${session.command}> `;
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
    printSectionTitle("start");
    printCommandList(ROOT_QUICK_START_COMMANDS.map((commandName) => ({
        name: commandName,
        summary: getShellCommandSummary(commandName),
    })));
};
const printRootOptions = () => {
    printSectionTitle("start");
    printCommandList(ROOT_QUICK_START_COMMANDS.map((commandName) => ({
        name: commandName,
        summary: getShellCommandSummary(commandName),
    })));
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
const getSlashAliasesForCommand = (command) => SESSION_SLASH_ALIASES[command] ?? {};
const getOptionSpecByKey = (session, key) => session.spec.options.find((option) => option.flag === `--${key}`);
const getPreferredSlashName = (session, key) => {
    const alias = Object.entries(getSlashAliasesForCommand(session.command)).find(([, target]) => target === key)?.[0];
    return alias ?? key;
};
const getSlashDisplayName = (session, key) => `/${getPreferredSlashName(session, key)}`;
const getShellCommandSummary = (command) => COMMAND_SUMMARY_OVERRIDES[command] ?? cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME[command].summary;
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
    process.stdout.write(`${formatStatusTag("cmd")} ${SHELL_THEME.command(buildCommandPreview(session.command, session.args))}\n`);
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
    printSectionTitle(`/${session.command}`);
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
const validateOptionValue = (key, rawValue) => {
    const trimmed = rawValue.trim();
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
            expectsPath: false,
        };
    }
    if (slashName === "local" && session.command === "load-source") {
        return {
            key,
            slashName,
            title: "Local file or repository path",
            examples: ["./robot.urdf", "./robot-description/"],
            expectsPath: true,
        };
    }
    if (slashName === "local") {
        return {
            key,
            slashName,
            title: "Local repository path",
            examples: ["./robot-description/"],
            expectsPath: true,
        };
    }
    if (key === "entry") {
        return {
            key,
            slashName,
            title: "Path inside the repository",
            examples: ["urdf/robot.urdf.xacro"],
            expectsPath: true,
        };
    }
    if (key === "urdf") {
        return {
            key,
            slashName,
            title: "URDF file path",
            examples: ["./robot.urdf"],
            expectsPath: true,
        };
    }
    if (key === "xacro") {
        return {
            key,
            slashName,
            title: "XACRO file path",
            examples: ["./robot.urdf.xacro"],
            expectsPath: true,
        };
    }
    if (key === "args") {
        return {
            key,
            slashName,
            title: "XACRO args",
            examples: ["prefix=demo,use_mock_hardware=true"],
            expectsPath: false,
        };
    }
    if (key === "out") {
        return {
            key,
            slashName,
            title: "Output file path",
            examples: ["./robot.fixed.urdf"],
            expectsPath: true,
        };
    }
    if (key === "path" && (session.command === "inspect-repo" || session.command === "repair-mesh-refs")) {
        return {
            key,
            slashName,
            title: "Repository subdirectory",
            examples: ["robots/arm"],
            expectsPath: true,
        };
    }
    if (key === "left" || key === "right") {
        return {
            key,
            slashName,
            title: `${key === "left" ? "Left" : "Right"} URDF path`,
            examples: [`./${key}.urdf`],
            expectsPath: true,
        };
    }
    const option = getOptionSpecByKey(session, key);
    return {
        key,
        slashName,
        title: option?.valueHint ? `${option.flag} (${option.valueHint})` : option?.flag ?? `--${key}`,
        examples: [],
        expectsPath: option?.isFilesystemPath === true,
    };
};
const printPendingValuePrompt = (pending) => {
    process.stdout.write(`\n${SHELL_THEME.section("input")}\n`);
    process.stdout.write(`${SHELL_THEME.command(pending.title)}\n`);
    if (pending.examples.length === 1) {
        process.stdout.write(`${SHELL_THEME.muted(`example: ${pending.examples[0]}`)}\n`);
        return;
    }
    if (pending.examples.length > 1) {
        process.stdout.write(`${SHELL_THEME.muted("examples:")}\n`);
        for (const example of pending.examples) {
            process.stdout.write(`  ${SHELL_THEME.muted(example)}\n`);
        }
    }
};
const isPathLikeOption = (session, key) => getOptionSpecByKey(session, key)?.isFilesystemPath === true;
const setSessionValue = (session, key, rawValue, feedback) => {
    const value = validateOptionValue(key, rawValue);
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
        return `[next] /health-check /validate /analyze /guess-orientation\nusing ${state.lastUrdfPath}`;
    }
    if (command === "inspect-repo") {
        return "[next] /load-source or /repair-mesh-refs";
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
const executeSessionCommand = (state, session) => {
    const preview = buildCommandPreview(session.command, session.args);
    const argv = [CLI_ENTRY_PATH, session.command];
    for (const [key, value] of session.args.entries()) {
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
    const status = result.status ?? 1;
    if (status === 0) {
        updateRememberedUrdfPath(state, session);
    }
    return {
        preview,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        status,
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
const createSession = (command, state, feedback) => {
    const session = {
        command,
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
    if (!state.session) {
        return [
            ...SHELL_BUILTIN_COMMANDS.map((entry) => entry.name),
            ...commandCatalog_1.CLI_HELP_SECTIONS.flatMap((section) => section.commands),
        ];
    }
    return [
        ...new Set([
            ...SESSION_BUILTIN_COMMANDS.map((entry) => entry.name),
            ...SESSION_SYSTEM_MENU_ENTRIES.map((entry) => entry.name),
            ...getSessionOptionEntries(state.session).map((entry) => entry.name),
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
        if (state.session?.pending && !trimmed.startsWith("/")) {
            if (!state.session.pending.expectsPath) {
                return [[], line];
            }
            return [completePathFragment(trimmed), line];
        }
        if (!trimmed.startsWith("/")) {
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
    if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
        process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
        process.stdout.write(`${ROOT_GUIDANCE}\n`);
        return;
    }
    const feedback = [];
    state.session = createSession(slashCommand, state, feedback);
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
        process.stdout.write(`${SHELL_THEME.muted("back to root")}\n`);
        return;
    }
    if (slashCommand === "reset") {
        const feedback = [];
        state.session = createSession(session.command, state, feedback);
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
const getRootMenuEntries = () => {
    const seen = new Set();
    const entries = [];
    const addEntry = (entry) => {
        if (seen.has(entry.name)) {
            return;
        }
        seen.add(entry.name);
        entries.push(entry);
    };
    for (const commandName of ROOT_QUICK_START_COMMANDS) {
        addEntry({
            name: commandName,
            summary: getShellCommandSummary(commandName),
            kind: "flow",
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
    const parsed = parseSlashInput(input.trimStart());
    if (!parsed || parsed.inlineValue) {
        return [];
    }
    return filterMenuEntries(state.session ? getSessionMenuEntries(state.session) : getRootMenuEntries(), parsed.slashCommand);
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
    const badge = entry.kind === "flow" ? "cmd" : entry.kind === "option" ? "set" : entry.kind === "action" ? "act" : "sys";
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
    if (!state.session) {
        return "type / to open commands";
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
        ? SHELL_THEME.muted(`helper /${state.session.command}  arrows move  enter selects  ctrl+c exits`)
        : SHELL_THEME.muted("press / to open commands  arrows move  enter selects  ctrl+c exits"));
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
    lines.push(SHELL_THEME.section(state.session ? "current" : "start"));
    if (state.session) {
        const requirementStatus = getRequirementStatus(state.session);
        lines.push(requirementStatus.ready
            ? `  ${SHELL_THEME.success("ready")} ${SHELL_THEME.command("/run")}`
            : `  ${SHELL_THEME.accent("next")} ${SHELL_THEME.command(requirementStatus.nextSteps.map((step) => formatSlashSequence(state.session, step)).join(" or "))}`);
        lines.push(`  ${SHELL_THEME.muted("cmd")} ${SHELL_THEME.command(buildCommandPreview(state.session.command, state.session.args))}`);
        if (state.session.pending) {
            lines.push(`  ${SHELL_THEME.muted("input")} ${SHELL_THEME.command(state.session.pending.title)}`);
        }
    }
    else {
        for (const commandName of ROOT_QUICK_START_COMMANDS) {
            lines.push(`  ${SHELL_THEME.command(`/${commandName}`.padEnd(18))}${SHELL_THEME.muted(getShellCommandSummary(commandName))}`);
        }
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
    const promptLabel = state.session ? formatSessionPrompt(state.session).trimEnd() : formatRootPrompt().trimEnd();
    const promptLineIndex = lines.length;
    const placeholder = view.input.length === 0 ? getPromptPlaceholder(state) : "";
    lines.push(`${SHELL_THEME.command(promptLabel)} ${view.input}${placeholder ? SHELL_THEME.muted(placeholder) : ""}`);
    if (state.session?.pending && state.session.pending.examples.length > 0 && !view.input.startsWith("/")) {
        lines.push(SHELL_THEME.section("examples"));
        for (const example of state.session.pending.examples.slice(0, 2)) {
            lines.push(`  ${SHELL_THEME.muted(example)}`);
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
    if (state.session?.pending && !input.startsWith("/") && state.session.pending.expectsPath) {
        const matches = completePathFragment(input.trim());
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
const runLineInteractiveShell = async (options = {}) => {
    const state = {
        session: null,
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
    rl.setPrompt(formatRootPrompt());
    rl.prompt();
    for await (const line of rl) {
        const trimmed = line.trim();
        const session = state.session;
        if (session?.pending && !trimmed.startsWith("/")) {
            handlePendingValue(line, state);
        }
        else if (trimmed.startsWith("/")) {
            const parsed = parseSlashInput(trimmed);
            if (parsed) {
                if (session) {
                    handleSessionSlashCommand(parsed.slashCommand, parsed.inlineValue, state);
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
            else {
                process.stdout.write(`${SHELL_THEME.muted(ROOT_GUIDANCE)}\n`);
            }
        }
        else if (session?.pending) {
            handlePendingValue(line, state);
        }
        else {
            process.stdout.write(`${SHELL_THEME.muted("type / for commands")}\n`);
        }
        if (isClosed) {
            break;
        }
        rl.setPrompt(state.session ? formatSessionPrompt(state.session) : formatRootPrompt());
        rl.prompt();
    }
};
const runTtyInteractiveShell = async (options = {}) => {
    const state = {
        session: null,
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
        state.session = createSession(command, state, feedback);
        setNoticeFromFeedback(view, feedback);
        view.output = null;
        pushTimelineEntry(view, `/${command}`);
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
        if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
            view.notice = { kind: "error", text: `Unknown slash command: /${slashCommand}` };
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
            view.notice = { kind: "info", text: "back to root" };
            view.output = null;
            pushTimelineEntry(view, "/back");
            return true;
        }
        if (slashCommand === "reset") {
            const feedback = [];
            state.session = createSession(session.command, state, feedback);
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
            kind: "info",
            text: session.pending.examples[0] !== undefined
                ? `${session.pending.title}: ${session.pending.examples[0]}`
                : session.pending.title,
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
        if (state.session?.pending && !trimmed.startsWith("/")) {
            handlePendingInput();
            setInput("");
            return;
        }
        if (trimmed.startsWith("/")) {
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
            else {
                handleRootAction(parsed.slashCommand);
            }
            setInput("");
            return;
        }
        if (trimmed.length === 0) {
            view.notice = {
                kind: "info",
                text: state.session ? getPromptPlaceholder(state) : ROOT_GUIDANCE,
            };
            return;
        }
        view.notice = { kind: "info", text: "type / to open commands" };
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
            const menuEntries = getSlashMenuEntries(state, view.input);
            if (menuEntries.length > 0) {
                view.menuIndex = clamp(view.menuIndex + 1, 0, menuEntries.length - 1);
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
        "Start the i<3urdf interactive shell with an inline picker.",
        "",
        "Usage",
        "  ilu",
        "  ilu shell",
        "",
        "Inside the shell",
        "  /                  Open the picker under the prompt",
        "  up/down/tab        Move through picker options",
        "  enter              Select the highlighted option",
        "  ctrl+c             Exit immediately",
        "  esc                Close the picker or cancel a pending value",
        "  /update            Install the latest ilu release",
        "  /load-source       Start a guided load-source flow",
        "  /repo              Set a GitHub repo or URL when the helper supports it",
        "  /local             Set a local path when the helper supports it",
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

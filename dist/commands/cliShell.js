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
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const SHELL_BUILTIN_COMMANDS = [
    { name: "help", summary: "Show slash commands for the current context." },
    { name: "clear", summary: "Clear the terminal." },
    { name: "last", summary: "Show the last remembered URDF path." },
    { name: "exit", summary: "Exit the interactive shell." },
    { name: "quit", summary: "Exit the interactive shell." },
];
const SESSION_BUILTIN_COMMANDS = [
    { name: "show", summary: "Show the current command, values, and next step." },
    { name: "run", summary: "Run the current command." },
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
const ROOT_GUIDANCE = "Type / for all helpers. /exit quits.";
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
const printSectionTitle = (title) => {
    process.stdout.write(`\n${title}\n`);
};
const printCommandList = (entries, prefix = "/", includeSummary = true) => {
    for (const entry of entries) {
        if (!includeSummary || !entry.summary) {
            process.stdout.write(`  ${prefix}${entry.name}\n`);
            continue;
        }
        process.stdout.write(`  ${prefix}${entry.name.padEnd(18)} ${entry.summary}\n`);
    }
};
const printRootQuickStart = () => {
    process.stdout.write("ILU shell\n");
    process.stdout.write("Slash-first help for loading, checking, and fixing URDFs.\n");
    printSectionTitle("Start Here");
    printCommandList(ROOT_QUICK_START_COMMANDS.map((commandName) => ({
        name: commandName,
        summary: getShellCommandSummary(commandName),
    })));
    process.stdout.write(`\n${ROOT_GUIDANCE}\n`);
};
const printRootOptions = () => {
    printSectionTitle("Quick Start");
    printCommandList(ROOT_QUICK_START_COMMANDS.map((commandName) => ({
        name: commandName,
        summary: getShellCommandSummary(commandName),
    })));
    printSectionTitle("Shell");
    printCommandList(SHELL_BUILTIN_COMMANDS);
    for (const section of commandCatalog_1.CLI_HELP_SECTIONS) {
        printSectionTitle(section.title);
        if (section.summary) {
            process.stdout.write(`  ${section.summary}\n`);
        }
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
        ? "Ready: /run\n"
        : `Next: ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}\n`);
    process.stdout.write(`Preview: ${buildCommandPreview(session.command, session.args)}\n`);
};
const printSessionPreview = (session) => {
    printSectionTitle("Current Command");
    process.stdout.write(`  ${buildCommandPreview(session.command, session.args)}\n`);
    if (session.args.size > 0) {
        printSectionTitle("Collected Values");
        for (const [key, value] of session.args.entries()) {
            const renderedValue = value === true ? "enabled" : quoteForPreview(String(value));
            process.stdout.write(`  ${getSlashDisplayName(session, key).padEnd(18)} ${renderedValue}\n`);
        }
    }
    const requirementStatus = getRequirementStatus(session);
    printSectionTitle(requirementStatus.ready ? "Ready" : "Next");
    if (requirementStatus.ready) {
        process.stdout.write("  /run\n");
        return;
    }
    for (const step of requirementStatus.nextSteps) {
        process.stdout.write(`  ${formatSlashSequence(session, step)}\n`);
    }
};
const printSessionOptions = (session) => {
    const entries = getSessionOptionEntries(session);
    const requiredEntries = entries.filter((entry) => entry.priority === "required");
    const commonEntries = entries.filter((entry) => entry.priority === "common");
    const advancedEntries = entries.filter((entry) => entry.priority === "advanced");
    printSectionTitle(`/${session.command}`);
    process.stdout.write(`  ${getShellCommandSummary(session.command)}\n`);
    if (requiredEntries.length > 0) {
        printSectionTitle("Start Here");
        printCommandList(requiredEntries);
    }
    if (commonEntries.length > 0) {
        printSectionTitle("Common");
        printCommandList(commonEntries);
    }
    if (advancedEntries.length > 0) {
        printSectionTitle("Advanced");
        printCommandList(advancedEntries);
    }
    printSectionTitle("Actions");
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
    process.stdout.write(`\n${pending.title}\n`);
    if (pending.examples.length === 1) {
        process.stdout.write(`Example: ${pending.examples[0]}\n`);
        return;
    }
    if (pending.examples.length > 1) {
        process.stdout.write("Examples:\n");
        for (const example of pending.examples) {
            process.stdout.write(`  ${example}\n`);
        }
    }
};
const isPathLikeOption = (session, key) => getOptionSpecByKey(session, key)?.isFilesystemPath === true;
const setSessionValue = (session, key, rawValue) => {
    const value = validateOptionValue(key, rawValue);
    if (!value) {
        if (key === "github") {
            process.stderr.write("Expected owner/repo or a GitHub repository URL.\n");
        }
        else {
            process.stderr.write(`Invalid value for --${key}.\n`);
        }
        return false;
    }
    clearMutuallyExclusiveArgs(session, key);
    session.args.set(key, value);
    process.stdout.write(`Set --${key} ${quoteForPreview(value)}\n`);
    return true;
};
const toggleSessionFlag = (session, key) => {
    if (session.args.get(key) === true) {
        session.args.delete(key);
        process.stdout.write(`Unset --${key}\n`);
        return;
    }
    session.args.set(key, true);
    process.stdout.write(`Enabled --${key}\n`);
};
const printLastUrdf = (state) => {
    if (!state.lastUrdfPath) {
        process.stdout.write("No URDF path is currently remembered.\n");
        return;
    }
    process.stdout.write(`Last URDF: ${state.lastUrdfPath}\n`);
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
const printFollowUpSuggestions = (state, command) => {
    if ((command === "load-source" || command === "xacro-to-urdf") && state.lastUrdfPath) {
        process.stdout.write(`Next helpers: /health-check, /validate, /analyze, /guess-orientation\nUsing remembered URDF: ${state.lastUrdfPath}\n`);
        return;
    }
    if (command === "inspect-repo") {
        process.stdout.write("Next helpers: /load-source or /repair-mesh-refs\n");
        return;
    }
    if (state.lastUrdfPath) {
        process.stdout.write(`Remembered URDF: ${state.lastUrdfPath}\n`);
    }
};
const executeSessionCommand = (state, session) => {
    const preview = buildCommandPreview(session.command, session.args);
    process.stdout.write(`\n> ${preview}\n`);
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
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
    if (result.status !== 0) {
        process.stderr.write(`[${session.command}] exited with status ${result.status ?? 1}\n`);
        return;
    }
    updateRememberedUrdfPath(state, session);
    printFollowUpSuggestions(state, session.command);
};
const createSession = (command, state) => {
    const session = {
        command,
        spec: cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME[command],
        args: new Map(),
        pending: null,
    };
    if (state.lastUrdfPath && getOptionSpecByKey(session, "urdf")) {
        session.args.set("urdf", state.lastUrdfPath);
        process.stdout.write(`Using remembered URDF: ${state.lastUrdfPath}\n`);
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
    if (slashCommand === "last") {
        printLastUrdf(state);
        return;
    }
    if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
        process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
        process.stdout.write(`${ROOT_GUIDANCE}\n`);
        return;
    }
    state.session = createSession(slashCommand, state);
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
        process.stdout.write("Returned to root. Type / for commands.\n");
        return;
    }
    if (slashCommand === "reset") {
        state.session = createSession(session.command, state);
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
            process.stderr.write(`Missing input. Next: ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}\n`);
            return;
        }
        executeSessionCommand(state, session);
        return;
    }
    if (slashCommand === "last") {
        printLastUrdf(state);
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
        toggleSessionFlag(session, target.key);
        printSessionStatus(session);
        return;
    }
    if (inlineValue) {
        if (setSessionValue(session, target.key, inlineValue)) {
            session.pending = null;
            printSessionStatus(session);
        }
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
    if (setSessionValue(session, session.pending.key, input)) {
        session.pending = null;
        printSessionStatus(session);
        return;
    }
    printPendingValuePrompt(session.pending);
};
const renderShellHelp = () => {
    return [
        "Start the interactive slash-command shell.",
        "",
        "Usage",
        "  ilu",
        "  ilu shell",
        "",
        "Inside the shell",
        "  /                  Show all helpers",
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
                process.stdout.write(`${ROOT_GUIDANCE}\n`);
            }
        }
        else if (session?.pending) {
            handlePendingValue(line, state);
        }
        else {
            process.stdout.write("Use / to choose a helper. Type / for commands.\n");
        }
        if (isClosed) {
            break;
        }
        rl.setPrompt(state.session ? formatSessionPrompt(state.session) : formatRootPrompt());
        rl.prompt();
    }
};
exports.runInteractiveShell = runInteractiveShell;

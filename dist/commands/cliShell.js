"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInteractiveShell = exports.renderShellHelp = void 0;
const node_child_process_1 = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const process = require("node:process");
const AdmZip = require("adm-zip");
const commandCatalog_1 = require("./commandCatalog");
const cliCompletion_1 = require("./cliCompletion");
const cliShellConfig_1 = require("./cliShellConfig");
const cliShellRecommendations_1 = require("./cliShellRecommendations");
const cliShellUi_1 = require("./cliShellUi");
const shellPathInput_1 = require("./shellPathInput");
const cliUpdate_1 = require("./cliUpdate");
const githubCliAuth_1 = require("../node/githubCliAuth");
const fixMeshPaths_1 = require("../mesh/fixMeshPaths");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const describeLocalSourceValue = (value) => {
    const localPath = detectLocalPathDrop(value);
    if (localPath?.isDirectory) {
        return `folder ${(0, cliShellConfig_1.quoteForPreview)(value)}`;
    }
    if (localPath?.isZipFile) {
        return `archive ${(0, cliShellConfig_1.quoteForPreview)(value)}`;
    }
    if (localPath?.isXacroFile) {
        return `xacro ${(0, cliShellConfig_1.quoteForPreview)(value)}`;
    }
    return `file ${(0, cliShellConfig_1.quoteForPreview)(value)}`;
};
const getLoadedSourceContextRows = (state) => {
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
            { label: "source", value: `remembered ${(0, cliShellConfig_1.quoteForPreview)(state.lastUrdfPath)}` },
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
    const rows = [];
    if (loadedSource.source === "github") {
        rows.push({
            label: "source",
            value: `GitHub ${(0, cliShellConfig_1.quoteForPreview)(loadedSource.githubRef ?? loadedSource.urdfPath)}`,
        });
    }
    else if (loadedSource.source === "local-repo") {
        rows.push({
            label: "source",
            value: `folder ${(0, cliShellConfig_1.quoteForPreview)(loadedSource.localPath ?? loadedSource.urdfPath)}`,
        });
    }
    else {
        rows.push({
            label: "source",
            value: describeLocalSourceValue(loadedSource.localPath ?? loadedSource.urdfPath),
        });
    }
    if (loadedSource.repositoryUrdfPath) {
        rows.push({ label: "entry", value: loadedSource.repositoryUrdfPath });
    }
    if (loadedSource.urdfPath &&
        (loadedSource.source !== "local-file" || loadedSource.localPath !== loadedSource.urdfPath)) {
        rows.push({ label: "working urdf", value: (0, cliShellConfig_1.quoteForPreview)(loadedSource.urdfPath) });
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
const printRootOptions = (state) => {
    (0, cliShellUi_1.printSectionTitle)("context");
    (0, cliShellUi_1.printContextRows)(getLoadedSourceContextRows(state));
    (0, cliShellUi_1.printSectionTitle)("actions");
    (0, cliShellUi_1.printCommandList)(getReadySourceLabel(state) ? getLoadedRootCommandList() : START_ROOT_MENU_ENTRIES);
    (0, cliShellUi_1.printSectionTitle)("system");
    (0, cliShellUi_1.printCommandList)(cliShellConfig_1.SHELL_BUILTIN_COMMANDS);
};
const printRootTaskOptions = (_task) => {
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("Direct actions only. Type / for actions or paste a source.\n")}`);
    printRootOptions({
        lastUrdfPath: undefined,
        loadedSource: null,
    });
};
const getSlashAliasesForCommand = (command) => cliShellConfig_1.SESSION_SLASH_ALIASES[command] ?? {};
const getOptionSpecByKey = (session, key) => session.spec.options.find((option) => option.flag === `--${key}`);
const getPreferredSlashName = (session, key) => {
    const alias = Object.entries(getSlashAliasesForCommand(session.command)).find(([, target]) => target === key)?.[0];
    return alias ?? key;
};
const getSlashDisplayName = (session, key) => `/${getPreferredSlashName(session, key)}`;
const getShellCommandSummary = (command) => cliShellConfig_1.COMMAND_SUMMARY_OVERRIDES[command] ?? cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME[command].summary;
const getRootTaskSummary = (task) => cliShellConfig_1.ROOT_TASKS.find((entry) => entry.name === task)?.summary ?? "Task flow";
const getRootTaskActionDefinitions = (task) => cliShellConfig_1.ROOT_TASK_ACTIONS[task];
const getRootShellCommandDefinition = (name) => cliShellConfig_1.ROOT_SHELL_COMMANDS.find((entry) => entry.name === name);
const isFlatRootSession = (session) => cliShellConfig_1.FLAT_ROOT_SESSION_LABELS.has(session.label);
const shouldSuppressSessionOptionMenu = (session) => isFlatRootSession(session) && (session.pending !== null || session.args.size === 0);
const getSessionSourceValue = (session, keys) => {
    for (const key of keys) {
        const value = session.args.get(key);
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }
    return null;
};
const getSessionPurposeText = (session) => {
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
const getSessionNextText = (session) => {
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
const getSessionContextRows = (state, session) => {
    const rows = [];
    const githubSource = getSessionSourceValue(session, ["github"]);
    const localSource = getSessionSourceValue(session, ["local"]);
    const pathSource = getSessionSourceValue(session, ["path"]);
    const xacroSource = getSessionSourceValue(session, ["xacro"]);
    const urdfSource = getSessionSourceValue(session, ["urdf"]);
    const canReuseLoadedSource = session.label !== "open" &&
        session.label !== "inspect" &&
        !githubSource &&
        !localSource &&
        !pathSource &&
        !xacroSource &&
        session.inheritedKeys.has("urdf");
    if (githubSource) {
        rows.push({ label: "source", value: `GitHub ${(0, cliShellConfig_1.quoteForPreview)(githubSource)}` });
    }
    else if (localSource) {
        rows.push({ label: "source", value: `folder ${(0, cliShellConfig_1.quoteForPreview)(localSource)}` });
    }
    else if (pathSource) {
        rows.push({ label: "source", value: describeLocalSourceValue(pathSource) });
    }
    else if (xacroSource) {
        rows.push({ label: "source", value: `xacro ${(0, cliShellConfig_1.quoteForPreview)(xacroSource)}` });
    }
    else if (urdfSource && !canReuseLoadedSource) {
        rows.push({ label: "source", value: describeLocalSourceValue(urdfSource) });
    }
    else {
        rows.push(...getLoadedSourceContextRows(state).filter((row) => row.label === "source" || row.label === "entry"));
    }
    if (urdfSource) {
        const sourceValue = rows.find((row) => row.label === "source")?.value ?? "";
        const inlineUrdfValue = (0, cliShellConfig_1.quoteForPreview)(urdfSource);
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
const buildSessionNarrativeLines = (state, session) => getSessionContextRows(state, session)
    .filter((row) => row.label === "source" || row.label === "action" || row.label === "next")
    .map((row) => `${row.label} ${row.value}`);
const buildSessionHeadline = (session) => {
    switch (session.label) {
        case "open": {
            const source = getSessionSourceValue(session, ["github", "path"]);
            return source ? `open ${(0, cliShellConfig_1.quoteForPreview)(source)}` : "open a repo, folder, or file";
        }
        case "inspect": {
            const source = getSessionSourceValue(session, ["github", "local", "urdf"]);
            return source ? `inspect ${(0, cliShellConfig_1.quoteForPreview)(source)}` : "inspect a repo or URDF";
        }
        case "check": {
            const source = getSessionSourceValue(session, ["urdf"]);
            return source ? `check ${(0, cliShellConfig_1.quoteForPreview)(source)}` : "check a URDF";
        }
        case "convert": {
            const source = getSessionSourceValue(session, ["xacro", "urdf", "github", "local"]);
            return source ? `convert ${(0, cliShellConfig_1.quoteForPreview)(source)}` : "convert a source";
        }
        case "fix": {
            const source = getSessionSourceValue(session, ["urdf", "github", "local"]);
            return source ? `fix ${(0, cliShellConfig_1.quoteForPreview)(source)}` : "fix a URDF or repo";
        }
        default:
            return getShellCommandSummary(session.command);
    }
};
const findRootTaskAction = (task, slashCommand) => getRootTaskActionDefinitions(task).find((entry) => entry.name === slashCommand);
const getOptionOrderRank = (session, key) => {
    const customOrder = cliShellConfig_1.SESSION_OPTION_ORDER[session.command] ?? [];
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
    if (cliShellConfig_1.ADVANCED_OPTION_KEYS.has(key)) {
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
const shouldHideVisibleSessionOption = (session, key) => {
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
const getVisibleSessionOptionEntries = (session) => getSessionOptionEntries(session).filter((entry) => !shouldHideVisibleSessionOption(session, entry.key));
const formatSlashSequence = (session, keys) => keys.map((key) => getSlashDisplayName(session, key)).join(" + ");
const formatStatusTag = (label) => {
    switch (label) {
        case "next":
            return cliShellConfig_1.SHELL_THEME.accent(`[${label}]`);
        case "ready":
            return cliShellConfig_1.SHELL_THEME.success(`[${label}]`);
        case "flow":
            return cliShellConfig_1.SHELL_THEME.muted(label);
        case "cmd":
            return cliShellConfig_1.SHELL_THEME.muted(label);
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
const printSessionStatus = (state, session) => {
    (0, cliShellUi_1.printSectionTitle)("context");
    (0, cliShellUi_1.printContextRows)(getSessionContextRows(state, session));
};
const printSessionPreview = (state, session) => {
    (0, cliShellUi_1.printSectionTitle)("context");
    (0, cliShellUi_1.printContextRows)(getSessionContextRows(state, session));
    (0, cliShellUi_1.printSectionTitle)("command");
    process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.command((0, cliShellConfig_1.buildCommandPreview)(session.command, session.args))}\n`);
    if (session.args.size > 0) {
        (0, cliShellUi_1.printSectionTitle)("values");
        for (const [key, value] of session.args.entries()) {
            const renderedValue = value === true ? "enabled" : (0, cliShellConfig_1.quoteForPreview)(String(value));
            process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.command(getSlashDisplayName(session, key).padEnd(18))} ${renderedValue}\n`);
        }
    }
    (0, cliShellUi_1.printSectionTitle)("next");
    process.stdout.write(`  ${(0, cliShellUi_1.renderContextValue)(getSessionContextRows(state, session).find((row) => row.label === "next") ?? { label: "next", value: getSessionNextText(session) })}\n`);
};
const printSessionOptions = (state, session) => {
    if (shouldSuppressSessionOptionMenu(session)) {
        (0, cliShellUi_1.printSectionTitle)(`/${session.label}`);
        process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.muted(getShellCommandSummary(session.command))}\n`);
        printSessionStatus(state, session);
        (0, cliShellUi_1.printSectionTitle)("actions");
        (0, cliShellUi_1.printCommandList)(cliShellConfig_1.SESSION_BUILTIN_COMMANDS);
        if (session.pending) {
            printPendingValuePrompt(session.pending);
        }
        return;
    }
    const entries = getVisibleSessionOptionEntries(session);
    const requiredEntries = entries.filter((entry) => entry.priority === "required");
    const commonEntries = entries.filter((entry) => entry.priority === "common");
    const advancedEntries = entries.filter((entry) => entry.priority === "advanced");
    (0, cliShellUi_1.printSectionTitle)(`/${session.label}`);
    process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.muted(getShellCommandSummary(session.command))}\n`);
    printSessionStatus(state, session);
    if (requiredEntries.length > 0) {
        (0, cliShellUi_1.printSectionTitle)("start");
        (0, cliShellUi_1.printCommandList)(requiredEntries);
    }
    if (commonEntries.length > 0) {
        (0, cliShellUi_1.printSectionTitle)("more");
        (0, cliShellUi_1.printCommandList)(commonEntries);
    }
    if (advancedEntries.length > 0) {
        (0, cliShellUi_1.printSectionTitle)("advanced");
        (0, cliShellUi_1.printCommandList)(advancedEntries);
    }
    (0, cliShellUi_1.printSectionTitle)("actions");
    (0, cliShellUi_1.printCommandList)(cliShellConfig_1.SESSION_BUILTIN_COMMANDS);
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
    const groups = cliShellConfig_1.MUTUALLY_EXCLUSIVE_OPTION_GROUPS[session.command] ?? [];
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
const parseBangInput = (input) => {
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
const looksLikeFilesystemSeed = (rawValue) => {
    const normalized = (0, shellPathInput_1.normalizeFilesystemInput)(rawValue);
    return (normalized.startsWith("/") ||
        normalized.startsWith("./") ||
        normalized.startsWith("../") ||
        normalized.startsWith("~/") ||
        (0, shellPathInput_1.isWindowsAbsolutePath)(normalized) ||
        normalized.includes("/") ||
        normalized.includes("\\"));
};
const detectLocalPathDrop = (rawValue) => {
    const inputPath = (0, shellPathInput_1.normalizeFilesystemInput)(rawValue);
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
    }
    catch {
        return null;
    }
};
const detectGitHubReferenceInput = (rawValue) => {
    const normalized = (0, shellPathInput_1.normalizeShellInput)(rawValue);
    if (!normalized ||
        normalized.startsWith("/") ||
        normalized.startsWith("./") ||
        normalized.startsWith("../") ||
        normalized.startsWith("~/") ||
        detectLocalPathDrop(rawValue) ||
        (0, shellPathInput_1.isWindowsAbsolutePath)(normalized)) {
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
        ? (0, shellPathInput_1.normalizeShellInput)(rawValue)
        : isLocalFilesystemKey(session, key)
            ? (0, shellPathInput_1.normalizeFilesystemInput)(rawValue)
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
            notes: (0, cliShellConfig_1.hasGitHubAuthConfigured)()
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
    process.stdout.write(`\n${cliShellConfig_1.SHELL_THEME.section("input")}\n`);
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.command(pending.title)}\n`);
    if (pending.examples.length === 1) {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(`example: ${pending.examples[0]}`)}\n`);
    }
    else if (pending.examples.length > 1) {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("examples:")}\n`);
        for (const example of pending.examples) {
            process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.muted(example)}\n`);
        }
    }
    for (const note of pending.notes) {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.warning(note)}\n`);
    }
};
const isPathLikeOption = (session, key) => getOptionSpecByKey(session, key)?.isFilesystemPath === true;
const setSessionValue = (session, key, rawValue, feedback) => {
    const value = validateOptionValue(session, key, rawValue);
    if (!value) {
        if (key === "github") {
            (0, cliShellConfig_1.pushFeedback)(feedback, "error", "Expected owner/repo or a GitHub repository URL.");
        }
        else {
            (0, cliShellConfig_1.pushFeedback)(feedback, "error", `Invalid value for --${key}.`);
        }
        return false;
    }
    clearMutuallyExclusiveArgs(session, key);
    session.args.set(key, value);
    session.inheritedKeys.delete(key);
    (0, cliShellConfig_1.pushFeedback)(feedback, "success", `[set] --${key} ${(0, cliShellConfig_1.quoteForPreview)(value)}`);
    return true;
};
const toggleSessionFlag = (session, key, feedback) => {
    if (session.args.get(key) === true) {
        session.args.delete(key);
        session.inheritedKeys.delete(key);
        (0, cliShellConfig_1.pushFeedback)(feedback, "warning", `[unset] --${key}`);
        return;
    }
    session.args.set(key, true);
    session.inheritedKeys.delete(key);
    (0, cliShellConfig_1.pushFeedback)(feedback, "success", `[on] --${key}`);
};
const getLastUrdfMessage = (state) => state.lastUrdfPath ? `last ${state.lastUrdfPath}` : "no remembered URDF yet";
const printLastUrdf = (state) => {
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getLastUrdfMessage(state))}\n`);
};
const getReadySourceLabel = (state) => state.loadedSource?.githubRef || state.loadedSource?.localPath || state.loadedSource?.urdfPath || state.lastUrdfPath || null;
const rememberDirectUrdfSource = (state, urdfPath) => {
    state.loadedSource = {
        source: "local-file",
        urdfPath,
        localPath: urdfPath,
    };
};
const rememberLoadedSource = (state, payload, options = {}) => {
    const normalizedGitHubRef = typeof options.githubRef === "string" && options.githubRef.trim().length > 0
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
        const originalUrdfPath = payload.entryFormat === "urdf" ? path.join(localPath, payload.entryPath) : payload.outPath || state.lastUrdfPath || "";
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
const updateRememberedUrdfPath = (state, session) => {
    const directUrdfPath = session.args.get("urdf");
    if (typeof directUrdfPath === "string" && directUrdfPath.trim().length > 0) {
        state.lastUrdfPath = directUrdfPath;
        if (session.command !== "load-source") {
            rememberDirectUrdfSource(state, directUrdfPath);
        }
        return;
    }
    const outPath = session.args.get("out");
    if (typeof outPath === "string" && cliShellConfig_1.URDF_OUTPUT_COMMANDS.has(session.command)) {
        state.lastUrdfPath = outPath;
        rememberDirectUrdfSource(state, outPath);
    }
};
const getFollowUpSuggestionMessage = (state, command) => {
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
const printFollowUpSuggestions = (state, command) => {
    const message = getFollowUpSuggestionMessage(state, command);
    if (!message) {
        return;
    }
    for (const line of message.split("\n")) {
        if (line.startsWith("[next]")) {
            process.stdout.write(`${cliShellConfig_1.SHELL_THEME.accent(line)}\n`);
        }
        else {
            process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(line)}\n`);
        }
    }
};
const executeCliCommand = (command, args) => {
    const preview = (0, cliShellConfig_1.buildCommandPreview)(command, args);
    const argv = [cliShellConfig_1.CLI_ENTRY_PATH, command];
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
const executeSpecialCliCommand = (argv) => {
    const result = (0, node_child_process_1.spawnSync)(process.execPath, [cliShellConfig_1.CLI_ENTRY_PATH, ...argv], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    return {
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
const summarizeXacroRuntimePanel = (payload, statusLine) => {
    const lines = [statusLine];
    if (payload.runtime) {
        lines.push(`runtime ${payload.runtime}`);
    }
    lines.push(`python ${(0, cliShellConfig_1.quoteForPreview)(payload.pythonExecutable)}`);
    if (payload.venvPath) {
        lines.push(`venv ${(0, cliShellConfig_1.quoteForPreview)(payload.venvPath)}`);
    }
    return {
        title: "xacro",
        kind: "info",
        lines,
    };
};
const runXacroBangCommand = (state) => {
    const probeExecution = executeCliCommand("probe-xacro-runtime", new Map());
    const probePayload = parseExecutionJson(probeExecution);
    if (probePayload?.available) {
        const pendingRetry = state.xacroRetry;
        if (pendingRetry) {
            (0, cliShellConfig_1.clearXacroRetry)(state);
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
    const setupPayload = parseExecutionJson(setupExecution);
    if (setupPayload?.available) {
        const pendingRetry = state.xacroRetry;
        if (pendingRetry) {
            (0, cliShellConfig_1.clearXacroRetry)(state);
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
const formatCount = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
const buildPreviewErrorPanel = (title, execution) => {
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
const isMissingXacroRuntimeErrorText = (text) => /no (python |vendored )?xacro runtime available/i.test(text) ||
    /install xacro or provide i_love_urdf_xacrodoc_wheel/i.test(text) ||
    /set up a local xacro runtime/i.test(text);
const buildShellFailureNotice = (panel, fallbackText, fallbackKind = "error") => {
    if (panel?.title === "xacro") {
        return {
            kind: "warning",
            text: cliShellConfig_1.XACRO_RUNTIME_NOTICE,
        };
    }
    return {
        kind: fallbackKind,
        text: fallbackText,
    };
};
const runDoctorShellCommand = () => {
    const execution = executeSpecialCliCommand(["doctor"]);
    if (execution.status !== 0) {
        const panel = buildPreviewErrorPanel("doctor", execution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "doctor failed"),
        };
    }
    const doctorLines = execution.stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
    const trimmedLines = doctorLines[0] === "ILU Doctor" ? doctorLines.slice(1) : doctorLines;
    return {
        panel: {
            title: "doctor",
            kind: "info",
            lines: trimmedLines.slice(0, 20),
        },
        notice: { kind: "info", text: "runtime diagnostics ready" },
    };
};
const summarizeRepositoryPreview = (session, payload, options = {}) => {
    const sourceLabel = options.sourceLabelOverride ??
        payload.repositoryUrl ??
        (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : payload.inspectedPath ?? "source");
    const lines = [`source ${sourceLabel}`];
    if (payload.candidateCount === 0) {
        lines.push("no URDF or XACRO entrypoints found");
        lines.push(session.label === "open"
            ? "paste the repo entry path if you already know it"
            : "use /open if you want to load a specific target path");
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
        const details = (0, cliShellRecommendations_1.getCandidateDetails)(candidate);
        lines.push(`${index + 1}. ${candidate.path}${details.length > 0 ? `  ${details.join("  ")}` : ""}`);
    }
    if (payload.candidateCount > 3) {
        lines.push(`+${payload.candidateCount - 3} more`);
    }
    lines.push(session.label === "open"
        ? payload.candidateCount === 1
            ? "press Enter to load the match"
            : "select a candidate below and press Enter to load it"
        : "next /open to load it, or /path to narrow the repo");
    return {
        title: "preview",
        kind: "info",
        lines,
    };
};
const summarizeHealthPreview = (payload, urdfPath, suggestedAction = null) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    lines.push((0, cliShellRecommendations_1.getHealthStatusLine)(payload));
    if (payload.orientationGuess?.likelyUpAxis && payload.orientationGuess?.likelyForwardAxis) {
        lines.push(`orientation likely ${payload.orientationGuess.likelyUpAxis}-up / ${payload.orientationGuess.likelyForwardAxis}-forward`);
    }
    for (const finding of payload.findings.filter((entry) => entry.level !== "info").slice(0, 2)) {
        lines.push((0, cliShellRecommendations_1.formatAttentionDetail)(finding.message, finding.context));
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, suggestedAction, "next /analyze or /orientation if you want a deeper review");
    return {
        title: "health",
        kind: payload.ok && payload.summary.errors === 0 && payload.summary.warnings === 0 ? "success" : "info",
        lines,
    };
};
const summarizeAnalysisPreview = (payload, urdfPath, suggestedAction = null) => {
    const jointCount = payload.jointHierarchy?.orderedJoints?.length ?? 0;
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    if (!payload.isValid) {
        lines.push(payload.error || "could not analyze this URDF");
        return {
            title: "preview",
            kind: "error",
            lines,
        };
    }
    lines.push(payload.robotName ? `robot ${payload.robotName}` : "robot detected");
    lines.push(`${formatCount(payload.linkNames.length, "link")}  ${formatCount(jointCount, "joint")}`);
    if ((payload.sensors?.length ?? 0) > 0) {
        lines.push(`${formatCount(payload.sensors?.length ?? 0, "sensor")}`);
    }
    if (payload.rootLinks.length > 0) {
        lines.push(payload.rootLinks.length === 1
            ? `root ${payload.rootLinks[0]}`
            : `${formatCount(payload.rootLinks.length, "root link")}`);
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, suggestedAction, "next /health or /orientation if you want deeper review");
    return {
        title: "preview",
        kind: "info",
        lines,
    };
};
const summarizeInvestigateResult = (urdfPath, validation, health, analysis, orientation, suggestedAction = null) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    const jointCount = analysis.jointHierarchy?.orderedJoints?.length ?? 0;
    if (!analysis.isValid) {
        lines.push(analysis.error || "could not analyze this URDF");
        return {
            title: "investigation",
            kind: "error",
            lines,
        };
    }
    lines.push(analysis.robotName ? `robot ${analysis.robotName}` : "robot detected");
    lines.push(`${formatCount(analysis.linkNames.length, "link")}  ${formatCount(jointCount, "joint")}`);
    if ((analysis.sensors?.length ?? 0) > 0) {
        lines.push(`${formatCount(analysis.sensors?.length ?? 0, "sensor")}`);
    }
    lines.push((0, cliShellRecommendations_1.getValidationStatusLine)(validation));
    lines.push((0, cliShellRecommendations_1.getHealthStatusLine)(health));
    if (orientation.isValid && orientation.likelyUpAxis && orientation.likelyForwardAxis) {
        const confidence = typeof orientation.confidence === "number" && Number.isFinite(orientation.confidence)
            ? `  ${Math.round(orientation.confidence * 100)}%`
            : "";
        lines.push(`orientation likely ${orientation.likelyUpAxis}-up / ${orientation.likelyForwardAxis}-forward${confidence}`);
    }
    if (analysis.rootLinks.length > 0) {
        lines.push(analysis.rootLinks.length === 1
            ? `root ${analysis.rootLinks[0]}`
            : `${formatCount(analysis.rootLinks.length, "root link")}`);
    }
    const attentionLines = [];
    const needsAttention = !validation.isValid ||
        health.summary.errors > 0 ||
        health.summary.warnings > 0 ||
        analysis.meshReferences.length > 0;
    attentionLines.push(...(0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, 2));
    const orientationConflict = orientation.report?.conflicts?.[0];
    if (needsAttention && orientationConflict) {
        attentionLines.push(`note ${orientationConflict}`);
    }
    if (attentionLines.length === 0) {
        lines.push("no obvious problems found");
    }
    else {
        for (const line of attentionLines.slice(0, 3)) {
            lines.push(line);
        }
    }
    if (!needsAttention) {
        lines.push("looks ready");
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, suggestedAction, needsAttention ? "next /fix what needs attention or rerun /analyze" : "convert it when you need output");
    return {
        title: "investigation",
        kind: validation.isValid && health.ok && health.summary.warnings === 0 && attentionLines.length === 0
            ? "success"
            : "info",
        lines,
    };
};
const summarizeValidationResult = (payload, urdfPath, suggestedAction = null) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    lines.push((0, cliShellRecommendations_1.getValidationStatusLine)(payload));
    for (const issue of payload.issues.slice(0, 2)) {
        lines.push((0, cliShellRecommendations_1.formatAttentionDetail)(issue.message, issue.context));
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, suggestedAction, payload.isValid ? "next /analyze or /orientation if you want more" : "fix what needs attention and rerun /validate");
    return {
        title: "validation",
        kind: payload.isValid && payload.issues.length === 0 ? "success" : "info",
        lines,
    };
};
const summarizeOrientationResult = (payload, urdfPath) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
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
const resolveShellGitHubAccessToken = (session) => {
    const sessionToken = session?.args.get("token");
    if (typeof sessionToken === "string" && sessionToken.trim().length > 0) {
        return sessionToken.trim();
    }
    const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
    return envToken || (0, githubCliAuth_1.readGitHubCliToken)() || undefined;
};
const sanitizeUrdfSnapshotName = (hint) => {
    const normalized = path.basename(hint || "robot.urdf").replace(/\.(urdf\.xacro|xacro|zip)$/i, ".urdf");
    const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, "-");
    return safe.toLowerCase().endsWith(".urdf") ? safe : `${safe || "robot"}.urdf`;
};
const createTempUrdfSnapshotPath = (hint) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-loaded-"));
    return path.join(tempDir, sanitizeUrdfSnapshotName(hint));
};
const applyWorkingUrdfSnapshot = (state, urdfPath) => {
    state.lastUrdfPath = urdfPath;
    if (state.loadedSource) {
        state.loadedSource = {
            ...state.loadedSource,
            urdfPath,
        };
        return;
    }
    rememberDirectUrdfSource(state, urdfPath);
};
const runValidationAndHealthChecks = (urdfPath) => {
    const validationExecution = executeCliCommand("validate", new Map([["urdf", urdfPath]]));
    const healthExecution = executeCliCommand("health-check", new Map([["urdf", urdfPath]]));
    const validationPayload = parseExecutionJson(validationExecution);
    const healthPayload = parseExecutionJson(healthExecution);
    return {
        validationExecution,
        healthExecution,
        validationPayload,
        healthPayload,
    };
};
const summarizeRepairResult = (actionLine, validation, health, options = {}) => {
    const lines = [actionLine, "working copy ready", (0, cliShellRecommendations_1.getValidationStatusLine)(validation), (0, cliShellRecommendations_1.getHealthStatusLine)(health)];
    if (health.orientationGuess?.likelyUpAxis && health.orientationGuess?.likelyForwardAxis) {
        lines.push(`orientation likely ${health.orientationGuess.likelyUpAxis}-up / ${health.orientationGuess.likelyForwardAxis}-forward`);
    }
    for (const line of (0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, 2)) {
        lines.push(line);
    }
    if ((options.unresolvedMeshRefs ?? 0) > 0) {
        lines.push("some mesh references still need attention");
    }
    lines.push("next /analyze or paste another source");
    return {
        title: "repair",
        kind: validation.isValid &&
            health.ok &&
            health.summary.errors === 0 &&
            health.summary.warnings === 0 &&
            (options.unresolvedMeshRefs ?? 0) === 0
            ? "success"
            : "info",
        lines,
    };
};
const getSuggestedActionBusyState = (suggestedAction) => suggestedAction.kind === "repair-mesh-refs"
    ? {
        title: "repairing",
        lines: ["repairing mesh references...", "rerunning validation and health check..."],
    }
    : {
        title: "repairing",
        lines: ["repairing mesh paths...", "rerunning validation and health check..."],
    };
const runSuggestedAction = (state) => {
    const suggestedAction = state.suggestedAction;
    (0, cliShellConfig_1.clearSuggestedAction)(state);
    if (!suggestedAction) {
        return {
            panel: null,
            notice: { kind: "info", text: getRootIdleMessage(state) },
            clearSession: false,
        };
    }
    if (suggestedAction.kind === "repair-mesh-refs") {
        const source = state.loadedSource;
        const repositoryRef = source?.githubRef || source?.localPath;
        if (!source || !source.repositoryUrdfPath || !repositoryRef) {
            return {
                panel: (0, cliShellUi_1.createOutputPanel)("repair", "could not find a loaded repository source", "error"),
                notice: { kind: "error", text: "repair could not start" },
                clearSession: false,
            };
        }
        const outPath = createTempUrdfSnapshotPath(source.repositoryUrdfPath);
        const args = new Map([
            ["urdf", source.repositoryUrdfPath],
            ["out", outPath],
        ]);
        if (source.githubRef) {
            args.set("github", source.githubRef);
            const token = resolveShellGitHubAccessToken();
            if (token) {
                args.set("token", token);
            }
        }
        else if (source.localPath) {
            args.set("local", source.localPath);
        }
        const repairExecution = executeCliCommand("repair-mesh-refs", args);
        const repairPayload = parseExecutionJson(repairExecution);
        if (!repairPayload) {
            const panel = buildPreviewErrorPanel("repair", repairExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "repair failed"),
                clearSession: false,
            };
        }
        const workingUrdfPath = repairPayload.outPath || outPath;
        if (!repairPayload.outPath) {
            fs.writeFileSync(workingUrdfPath, repairPayload.content, "utf8");
        }
        applyWorkingUrdfSnapshot(state, workingUrdfPath);
        const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(workingUrdfPath);
        if (!validationPayload || !healthPayload) {
            const panel = buildPreviewErrorPanel("repair", !validationPayload ? validationExecution : healthExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "repair checks failed"),
                clearSession: false,
            };
        }
        return {
            panel: summarizeRepairResult("repaired mesh references", validationPayload, healthPayload, {
                unresolvedMeshRefs: repairPayload.unresolved.length,
            }),
            notice: {
                kind: validationPayload.isValid &&
                    healthPayload.ok &&
                    healthPayload.summary.errors === 0 &&
                    healthPayload.summary.warnings === 0 &&
                    repairPayload.unresolved.length === 0
                    ? "success"
                    : "info",
                text: repairPayload.unresolved.length === 0
                    ? "mesh references repaired"
                    : "mesh references repaired. review the remaining attention points",
            },
            clearSession: false,
        };
    }
    const urdfPath = state.loadedSource?.urdfPath || state.lastUrdfPath;
    if (!urdfPath) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("repair", "could not find a loaded URDF", "error"),
            notice: { kind: "error", text: "repair could not start" },
            clearSession: false,
        };
    }
    try {
        const fixed = (0, fixMeshPaths_1.fixMeshPaths)(fs.readFileSync(urdfPath, "utf8"));
        const workingUrdfPath = createTempUrdfSnapshotPath(urdfPath);
        fs.writeFileSync(workingUrdfPath, fixed.urdfContent, "utf8");
        applyWorkingUrdfSnapshot(state, workingUrdfPath);
        const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(workingUrdfPath);
        if (!validationPayload || !healthPayload) {
            const panel = buildPreviewErrorPanel("repair", !validationPayload ? validationExecution : healthExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "repair checks failed"),
                clearSession: false,
            };
        }
        return {
            panel: summarizeRepairResult("repaired mesh paths", validationPayload, healthPayload),
            notice: {
                kind: validationPayload.isValid &&
                    healthPayload.ok &&
                    healthPayload.summary.errors === 0 &&
                    healthPayload.summary.warnings === 0
                    ? "success"
                    : "info",
                text: fixed.corrections.length > 0 ? "mesh paths repaired" : "mesh paths already looked consistent",
            },
            clearSession: false,
        };
    }
    catch (error) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("repair", error instanceof Error ? error.message : String(error), "error"),
            notice: { kind: "error", text: "repair failed" },
            clearSession: false,
        };
    }
};
const resolveExtractedArchiveRoot = (archiveRoot) => {
    const entries = fs
        .readdirSync(archiveRoot, { withFileTypes: true })
        .filter((entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store");
    if (entries.length === 1 && entries[0]?.isDirectory()) {
        return path.join(archiveRoot, entries[0].name);
    }
    return archiveRoot;
};
const resolveLoadableSourcePath = (sourcePath) => {
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
const cloneArgsMap = (args) => new Map(args.entries());
const prepareLoadSourceArgs = (session) => {
    const execArgs = cloneArgsMap(session.args);
    let extractedArchivePath;
    const sourcePath = execArgs.get("path");
    if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
        try {
            const resolved = resolveLoadableSourcePath(sourcePath);
            execArgs.set("path", resolved.workingPath);
            extractedArchivePath = resolved.extractedArchivePath;
        }
        catch (error) {
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
const inspectRepositoryCandidatesForLoad = (session, execArgs, options = {}) => {
    const previewArgs = new Map();
    const github = execArgs.get("github");
    const sourcePath = execArgs.get("path");
    if (typeof github === "string" && github.trim().length > 0) {
        previewArgs.set("github", github);
    }
    else if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
        const localPath = detectLocalPathDrop(sourcePath);
        if (!localPath?.isDirectory) {
            return null;
        }
        previewArgs.set("local", sourcePath);
    }
    else {
        return null;
    }
    const execution = executeCliCommand("inspect-repo", previewArgs);
    const payload = parseExecutionJson(execution);
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
                ? (0, cliShellConfig_1.quoteForPreview)(options.extractedArchivePath)
                : undefined,
        }),
    };
};
const executeLoadSourceChecks = (state, execArgs, options = {}) => {
    const loadArgs = cloneArgsMap(execArgs);
    const outputPath = createTempUrdfSnapshotPath(String(loadArgs.get("entry") || loadArgs.get("path") || loadArgs.get("github") || "robot.urdf"));
    loadArgs.set("out", outputPath);
    const loadExecution = executeCliCommand("load-source", loadArgs);
    const loadPayload = parseExecutionJson(loadExecution);
    if (!loadPayload || !loadPayload.outPath) {
        (0, cliShellConfig_1.clearSuggestedAction)(state);
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
        }
        else {
            (0, cliShellConfig_1.clearXacroRetry)(state);
        }
        return {
            panel,
            notice: buildShellFailureNotice(panel, "could not load source"),
            clearSession: false,
        };
    }
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.lastUrdfPath = loadPayload.outPath;
    rememberLoadedSource(state, loadPayload, {
        githubRef: typeof execArgs.get("github") === "string" ? String(execArgs.get("github")) : undefined,
    });
    const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(loadPayload.outPath);
    if (!validationPayload || !healthPayload) {
        const panel = buildPreviewErrorPanel("error", !validationPayload ? validationExecution : healthExecution);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "validation failed to run"),
            clearSession: false,
        };
    }
    state.suggestedAction = (0, cliShellRecommendations_1.detectSuggestedAction)(state, {
        selectedCandidate: options.selectedCandidate,
        urdfPath: loadPayload.outPath,
    });
    const panel = summarizeAutoLoadChecks(loadPayload, validationPayload, healthPayload, {
        extractedArchivePath: options.extractedArchivePath,
        requestedEntryPath: options.requestedEntryPath,
        suggestedAction: state.suggestedAction,
    });
    return {
        panel,
        notice: {
            kind: panel.kind === "success" ? "success" : "info",
            text: panel.kind === "success"
                ? "validation and health check passed"
                : "source loaded. review the checks",
        },
        clearSession: true,
    };
};
const runSelectedCandidatePicker = (state, selectionPath) => {
    const picker = state.candidatePicker;
    if (!picker) {
        return null;
    }
    const execArgs = cloneArgsMap(picker.loadArgs);
    execArgs.set("entry", selectionPath);
    const selectedCandidate = picker.candidates.find((candidate) => candidate.path === selectionPath);
    return executeLoadSourceChecks(state, execArgs, {
        extractedArchivePath: picker.extractedArchivePath,
        requestedEntryPath: selectionPath,
        selectedCandidate,
    });
};
const summarizeAutoLoadChecks = (loadResult, validation, health, options = {}) => {
    const lines = [];
    if (options.extractedArchivePath) {
        lines.push(`opened archive ${(0, cliShellConfig_1.quoteForPreview)(options.extractedArchivePath)}`);
    }
    if (loadResult.repositoryUrl) {
        lines.push(`source ${loadResult.repositoryUrl}`);
    }
    else {
        lines.push(`source ${(0, cliShellConfig_1.quoteForPreview)(loadResult.inspectedPath)}`);
    }
    lines.push(`loaded ${loadResult.entryPath}`);
    if ((loadResult.candidateCount ?? 0) > 1) {
        lines.push(options.requestedEntryPath === loadResult.entryPath
            ? `selected ${loadResult.entryPath} from ${formatCount(loadResult.candidateCount ?? 0, "candidate")}`
            : `picked best match from ${formatCount(loadResult.candidateCount ?? 0, "candidate")}`);
    }
    lines.push((0, cliShellRecommendations_1.getValidationStatusLine)(validation));
    lines.push((0, cliShellRecommendations_1.getHealthStatusLine)(health));
    if (health.orientationGuess?.likelyUpAxis && health.orientationGuess?.likelyForwardAxis) {
        lines.push(`orientation likely ${health.orientationGuess.likelyUpAxis}-up / ${health.orientationGuess.likelyForwardAxis}-forward`);
    }
    for (const line of (0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, 2)) {
        lines.push(line);
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, options.suggestedAction ?? null, "next /analyze /health /validate /orientation or paste another source");
    return {
        title: "loaded",
        kind: validation.isValid &&
            health.ok &&
            health.summary.errors === 0 &&
            health.summary.warnings === 0 &&
            !options.suggestedAction
            ? "success"
            : "info",
        lines,
    };
};
const summarizeDirectUrdfChecks = (urdfPath, validation, health, suggestedAction = null) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    lines.push((0, cliShellRecommendations_1.getValidationStatusLine)(validation));
    lines.push((0, cliShellRecommendations_1.getHealthStatusLine)(health));
    if (health.orientationGuess?.likelyUpAxis && health.orientationGuess?.likelyForwardAxis) {
        lines.push(`orientation likely ${health.orientationGuess.likelyUpAxis}-up / ${health.orientationGuess.likelyForwardAxis}-forward`);
    }
    for (const line of (0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, 2)) {
        lines.push(line);
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, suggestedAction, "next /analyze /health /validate /orientation or paste another source");
    return {
        title: "checks",
        kind: validation.isValid &&
            health.ok &&
            health.summary.errors === 0 &&
            health.summary.warnings === 0 &&
            !suggestedAction
            ? "success"
            : "info",
        lines,
    };
};
const runDirectInputAutomation = (state, session, changedKey) => {
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
        const hasExplicitEntry = typeof execArgs.get("entry") === "string" && String(execArgs.get("entry")).trim().length > 0;
        if (!hasExplicitEntry && (changedKey === "github" || changedKey === "path")) {
            const preview = inspectRepositoryCandidatesForLoad(session, execArgs, {
                extractedArchivePath,
            });
            if (preview) {
                if (preview.panel.kind === "error") {
                    (0, cliShellConfig_1.clearCandidatePicker)(state);
                    return {
                        panel: preview.panel,
                        notice: { kind: "error", text: "preview failed" },
                        clearSession: false,
                    };
                }
                if (preview.payload.candidateCount === 0) {
                    (0, cliShellConfig_1.clearCandidatePicker)(state);
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
                const selectedCandidate = typeof execArgs.get("entry") === "string"
                    ? preview.payload.candidates.find((candidate) => candidate.path === execArgs.get("entry"))
                    : undefined;
                (0, cliShellConfig_1.clearCandidatePicker)(state);
                return executeLoadSourceChecks(state, execArgs, {
                    extractedArchivePath,
                    requestedEntryPath: typeof execArgs.get("entry") === "string" ? String(execArgs.get("entry")) : undefined,
                    selectedCandidate,
                });
            }
            else {
                (0, cliShellConfig_1.clearCandidatePicker)(state);
            }
        }
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        return executeLoadSourceChecks(state, execArgs, {
            extractedArchivePath,
            requestedEntryPath: typeof execArgs.get("entry") === "string" ? String(execArgs.get("entry")) : undefined,
        });
    }
    if (((session.command === "analyze" || session.command === "validate" || session.command === "guess-orientation") &&
        changedKey === "urdf") ||
        (session.command === "inspect-repo" && (changedKey === "github" || changedKey === "local"))) {
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        const execution = executeSessionCommand(state, session);
        if (execution.status !== 0) {
            const panel = getShellExecutionFailurePanel(execution, session.command);
            return {
                panel,
                notice: buildShellFailureNotice(panel, `${session.label} failed`),
                clearSession: false,
            };
        }
        const panel = getShellExecutionSuccessPanel(state, session, execution) ??
            (0, cliShellUi_1.createOutputPanel)("result", buildExecutionPanelText(execution, session.command), "success");
        return {
            panel,
            notice: {
                kind: panel?.kind === "error" ? "error" : panel?.kind === "success" ? "success" : "info",
                text: session.command === "inspect-repo"
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
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        const urdfPath = session.args.get("urdf");
        if (typeof urdfPath !== "string" || urdfPath.trim().length === 0) {
            return null;
        }
        state.lastUrdfPath = urdfPath;
        rememberDirectUrdfSource(state, urdfPath);
        const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(urdfPath);
        if (!validationPayload || !healthPayload) {
            const panel = buildPreviewErrorPanel("error", !validationPayload ? validationExecution : healthExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "checks failed to run"),
                clearSession: false,
            };
        }
        state.suggestedAction = (0, cliShellRecommendations_1.detectSuggestedAction)(state, { urdfPath });
        const panel = summarizeDirectUrdfChecks(urdfPath, validationPayload, healthPayload, state.suggestedAction);
        return {
            panel,
            notice: {
                kind: panel.kind === "success" ? "success" : "info",
                text: panel.kind === "success"
                    ? "validation and health check passed"
                    : "checks complete. review the results",
            },
            clearSession: true,
        };
    }
    return null;
};
const applyValueChangeEffects = (state, session, changedKey) => {
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
const buildAutoPreviewPanel = (state, session, changedKey) => {
    (0, cliShellConfig_1.clearCandidatePicker)(state);
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
            rememberDirectUrdfSource(state, urdfPath);
            state.suggestedAction = (0, cliShellRecommendations_1.detectSuggestedAction)(state, { urdfPath });
            return summarizeHealthPreview(payload, urdfPath, state.suggestedAction);
        }
        return buildPreviewErrorPanel("health", execution);
    }
    if (previewCommand === "analyze") {
        const payload = parseExecutionJson(execution);
        const urdfPath = String(previewArgs.get("urdf") || "");
        if (payload && urdfPath) {
            state.lastUrdfPath = urdfPath;
            rememberDirectUrdfSource(state, urdfPath);
            state.suggestedAction = (0, cliShellRecommendations_1.detectSuggestedAction)(state, { urdfPath });
            return summarizeAnalysisPreview(payload, urdfPath, state.suggestedAction);
        }
        return buildPreviewErrorPanel("preview", execution);
    }
    return null;
};
const executeSessionCommand = (state, session) => {
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
            const validationPayload = parseExecutionJson(validationExecution);
            const healthPayload = parseExecutionJson(healthExecution);
            const orientationPayload = parseExecutionJson(orientationExecution);
            const analysisPayload = parseExecutionJson(analysisExecution);
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
            state.suggestedAction = (0, cliShellRecommendations_1.detectSuggestedAction)(state, { urdfPath });
            return {
                preview: analysisExecution.preview,
                stdout: "",
                stderr: "",
                status: 0,
                followUp: getFollowUpSuggestionMessage(state, session.command),
                shellPanel: summarizeInvestigateResult(urdfPath, validationPayload, healthPayload, analysisPayload, orientationPayload, state.suggestedAction),
            };
        }
    }
    const result = executeCliCommand(session.command, session.args);
    const status = result.status;
    if (status === 0) {
        updateRememberedUrdfPath(state, session);
        if (session.command === "validate" || session.command === "health-check" || session.command === "guess-orientation") {
            const urdfPath = session.args.get("urdf");
            state.suggestedAction =
                typeof urdfPath === "string" && urdfPath.trim().length > 0
                    ? (0, cliShellRecommendations_1.detectSuggestedAction)(state, { urdfPath })
                    : null;
        }
        else if (session.command === "inspect-repo" || session.command === "repair-mesh-refs" || session.command === "fix-mesh-paths") {
            (0, cliShellConfig_1.clearSuggestedAction)(state);
        }
    }
    return {
        preview: result.preview,
        stdout: result.stdout,
        stderr: result.stderr,
        status: result.status,
        followUp: status === 0 ? getFollowUpSuggestionMessage(state, session.command) : null,
    };
};
const getShellExecutionSuccessPanel = (state, session, execution) => {
    if (execution.status !== 0) {
        return null;
    }
    if (execution.shellPanel) {
        return execution.shellPanel;
    }
    switch (session.command) {
        case "inspect-repo": {
            const payload = parseExecutionJson(execution);
            return payload ? summarizeRepositoryPreview(session, payload) : null;
        }
        case "health-check": {
            const payload = parseExecutionJson(execution);
            const urdfPath = session.args.get("urdf");
            return payload && typeof urdfPath === "string" ? summarizeHealthPreview(payload, urdfPath, state.suggestedAction) : null;
        }
        case "analyze": {
            const payload = parseExecutionJson(execution);
            const urdfPath = session.args.get("urdf");
            return payload && typeof urdfPath === "string" ? summarizeAnalysisPreview(payload, urdfPath, state.suggestedAction) : null;
        }
        case "validate": {
            const payload = parseExecutionJson(execution);
            const urdfPath = session.args.get("urdf");
            return payload && typeof urdfPath === "string" ? summarizeValidationResult(payload, urdfPath, state.suggestedAction) : null;
        }
        case "guess-orientation": {
            const payload = parseExecutionJson(execution);
            const urdfPath = session.args.get("urdf");
            return payload && typeof urdfPath === "string" ? summarizeOrientationResult(payload, urdfPath) : null;
        }
        default:
            return null;
    }
};
const tryCreateLoadedRootQuickSession = (state, command) => {
    if (!AUTO_RUN_READY_COMMANDS.has(command)) {
        return null;
    }
    const session = createSession(command, state, command);
    return getRequirementStatus(session).ready ? session : null;
};
const shouldAutoRunSession = (session) => AUTO_RUN_READY_COMMANDS.has(session.command) && getRequirementStatus(session).ready;
const getRootIdleMessage = (state) => state.lastUrdfPath
    ? "nothing is pending. use /analyze /health /validate /orientation or paste another source"
    : "nothing is pending. paste a source or use /open /inspect /analyze /health";
const getShellExecutionFailurePanel = (execution, command) => {
    const combinedOutput = [execution.stderr, execution.stdout].filter(Boolean).join("\n").trim();
    if (command === "xacro-to-urdf" &&
        isMissingXacroRuntimeErrorText(combinedOutput)) {
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
    return null;
};
const printSessionCommandExecution = (state, execution, session) => {
    const compactFailurePanel = execution.status !== 0 ? getShellExecutionFailurePanel(execution, session.command) : null;
    if (compactFailurePanel) {
        (0, cliShellConfig_1.writeFeedback)(buildShellFailureNotice(compactFailurePanel, `[${session.command}] exited with status ${execution.status}`));
        (0, cliShellUi_1.printOutputPanel)(compactFailurePanel);
        return;
    }
    const successPanel = getShellExecutionSuccessPanel(state, session, execution);
    if (successPanel) {
        (0, cliShellUi_1.printOutputPanel)(successPanel);
        if (execution.followUp) {
            for (const line of execution.followUp.split("\n")) {
                if (line.startsWith("[next]")) {
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.accent(line)}\n`);
                }
                else {
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(line)}\n`);
                }
            }
        }
        return;
    }
    process.stdout.write(`\n${formatStatusTag("cmd")} ${cliShellConfig_1.SHELL_THEME.command(execution.preview)}\n`);
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
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.accent(line)}\n`);
            }
            else {
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(line)}\n`);
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
        inheritedKeys: new Set(),
        pending: null,
    };
    const inheritedValues = [];
    const source = state.loadedSource;
    const canInheritLocalSource = source?.localPath &&
        getOptionSpecByKey(session, "local") &&
        (session.command === "inspect-repo" ||
            session.command === "repair-mesh-refs" ||
            (session.command === "xacro-to-urdf" && source?.source === "local-repo"));
    if (canInheritLocalSource && source?.localPath) {
        session.args.set("local", source.localPath);
        session.inheritedKeys.add("local");
        inheritedValues.push(["local", source.localPath]);
    }
    const canInheritGitHubSource = source?.githubRef &&
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
    }
    else if (state.lastUrdfPath && getOptionSpecByKey(session, "urdf")) {
        session.args.set("urdf", state.lastUrdfPath);
        session.inheritedKeys.add("urdf");
        inheritedValues.push(["urdf", state.lastUrdfPath]);
    }
    if (source?.repositoryUrdfPath &&
        command === "repair-mesh-refs" &&
        getOptionSpecByKey(session, "urdf") &&
        (session.args.has("local") || session.args.has("github"))) {
        session.args.set("urdf", source.repositoryUrdfPath);
        session.inheritedKeys.add("urdf");
        inheritedValues.push(["urdf", source.repositoryUrdfPath]);
    }
    if (inheritedValues.length > 0) {
        const primaryInherited = inheritedValues[0]?.[1];
        if (primaryInherited) {
            (0, cliShellConfig_1.pushFeedback)(feedback, "info", `using ${primaryInherited}`);
        }
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
                ...getSessionMenuEntries(state.session).map((entry) => entry.name),
                ...cliShellConfig_1.HIDDEN_SHELL_COMMAND_NAMES,
            ]),
        ];
    }
    return [
        ...new Set([
            ...getRootMenuEntries(state).map((entry) => entry.name),
            ...cliShellConfig_1.SHELL_BUILTIN_COMMANDS.map((entry) => entry.name),
            ...cliShellConfig_1.HIDDEN_SHELL_COMMAND_NAMES,
            ...commandCatalog_1.CLI_HELP_SECTIONS.flatMap((section) => section.commands),
        ]),
    ];
};
const listRecognizedSlashCommands = (state) => {
    const commands = new Set(listAvailableSlashCommands(state));
    if (!state.session) {
        commands.add("run");
    }
    return [...commands];
};
const completePathFragment = (fragment) => {
    const raw = fragment.length > 0 ? fragment : ".";
    const expanded = (0, shellPathInput_1.expandHomePath)(raw);
    const dirname = path.dirname(expanded);
    const basename = path.basename(expanded);
    const directory = dirname === "." && !expanded.startsWith(".") ? "." : dirname;
    try {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        return entries
            .filter((entry) => entry.name.startsWith(basename))
            .map((entry) => {
            const fullPath = path.join(directory, entry.name);
            const rendered = raw.startsWith("~") && fullPath.startsWith((0, shellPathInput_1.expandHomePath)("~"))
                ? `~${fullPath.slice((0, shellPathInput_1.expandHomePath)("~").length)}`
                : fullPath;
            return entry.isDirectory() ? `${rendered}${path.sep}` : rendered;
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
const shouldTreatAsSlashInput = (rawValue, state) => {
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
        if (recognizedCommands.includes(parsed.slashCommand) ||
            recognizedCommands.some((command) => command.startsWith(parsed.slashCommand))) {
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
const startRootTaskAction = (task, action, state, feedback) => {
    state.rootTask = task;
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.session = createSession(action.command, state, action.sessionLabel, feedback);
    if (state.session) {
        openPendingForSession(state.session, action.openPending);
    }
};
const startRootShellCommand = (entry, state, feedback) => {
    state.rootTask = null;
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.session = createSession(entry.command, state, entry.sessionLabel, feedback);
    if (state.session) {
        openPendingForSession(state.session, entry.openPending);
    }
};
const handleRootSlashCommand = (slashCommand, state, close) => {
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
        (0, cliUpdate_1.runUpdateCommand)();
        return;
    }
    if (slashCommand === "doctor") {
        const result = runDoctorShellCommand();
        (0, cliShellConfig_1.writeFeedback)(result.notice);
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return;
    }
    if (slashCommand === "last") {
        printLastUrdf(state);
        return;
    }
    if (slashCommand === "run") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getRootIdleMessage(state))}\n`);
        return;
    }
    const rootShellCommand = getRootShellCommandDefinition(slashCommand);
    if (rootShellCommand) {
        const feedback = [];
        startRootShellCommand(rootShellCommand, state, feedback);
        (0, cliShellConfig_1.flushFeedback)(feedback);
        if (state.session && shouldAutoRunSession(state.session)) {
            printSessionCommandExecution(state, executeSessionCommand(state, state.session), state.session);
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
    if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
        process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
        process.stdout.write(`${cliShellConfig_1.ROOT_GUIDANCE}\n`);
        return;
    }
    const command = slashCommand;
    const quickSession = tryCreateLoadedRootQuickSession(state, command);
    if (quickSession) {
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        printSessionCommandExecution(state, executeSessionCommand(state, quickSession), quickSession);
        return;
    }
    state.rootTask = null;
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    (0, cliShellConfig_1.clearXacroRetry)(state);
    const feedback = [];
    state.session = createSession(command, state, slashCommand, feedback);
    (0, cliShellConfig_1.flushFeedback)(feedback);
    printSessionOptions(state, state.session);
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
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        state.rootTask = null;
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("back to tasks")}\n`);
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
    if (slashCommand === "doctor") {
        const result = runDoctorShellCommand();
        (0, cliShellConfig_1.writeFeedback)(result.notice);
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return;
    }
    if (slashCommand === "last") {
        printLastUrdf(state);
        return;
    }
    if (slashCommand === "run") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("nothing is pending here. paste a source or use one of the direct actions")}\n`);
        return;
    }
    const action = findRootTaskAction(task, slashCommand);
    if (action) {
        const feedback = [];
        startRootTaskAction(task, action, state, feedback);
        (0, cliShellConfig_1.flushFeedback)(feedback);
        if (state.session && shouldAutoRunSession(state.session)) {
            printSessionCommandExecution(state, executeSessionCommand(state, state.session), state.session);
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
    if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
        process.stderr.write(`Unknown slash command: /${slashCommand}\n`);
        return;
    }
    const feedback = [];
    state.rootTask = null;
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.session = createSession(slashCommand, state, slashCommand, feedback);
    (0, cliShellConfig_1.flushFeedback)(feedback);
    printSessionOptions(state, state.session);
};
const handleSessionSlashCommand = (slashCommand, inlineValue, state) => {
    const session = state.session;
    if (!session) {
        return;
    }
    if (!slashCommand || slashCommand === "help") {
        printSessionOptions(state, session);
        return;
    }
    if (slashCommand === "back") {
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        state.session = null;
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(state.rootTask ? `back to /${state.rootTask}` : "back to tasks")}\n`);
        return;
    }
    if (slashCommand === "reset") {
        const feedback = [];
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        state.session = createSession(session.command, state, session.label, feedback);
        (0, cliShellConfig_1.flushFeedback)(feedback);
        printSessionOptions(state, state.session);
        return;
    }
    if (slashCommand === "show") {
        printSessionPreview(state, session);
        return;
    }
    if (slashCommand === "run") {
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        const requirementStatus = getRequirementStatus(session);
        if (!requirementStatus.ready) {
            process.stderr.write(`${cliShellConfig_1.SHELL_THEME.warning("[missing]")} ${requirementStatus.nextSteps.map((step) => formatSlashSequence(session, step)).join(" or ")}\n`);
            return;
        }
        printSessionCommandExecution(state, executeSessionCommand(state, session), session);
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
    if (slashCommand === "doctor") {
        const result = runDoctorShellCommand();
        (0, cliShellConfig_1.writeFeedback)(result.notice);
        (0, cliShellUi_1.printOutputPanel)(result.panel);
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
        const feedback = [];
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        toggleSessionFlag(session, target.key, feedback);
        (0, cliShellConfig_1.flushFeedback)(feedback);
        printSessionStatus(state, session);
        return;
    }
    if (inlineValue) {
        const feedback = [];
        if (setSessionValue(session, target.key, inlineValue, feedback)) {
            session.pending = null;
            (0, cliShellConfig_1.flushFeedback)(feedback);
            const { automation, preview } = applyValueChangeEffects(state, session, target.key);
            if (automation) {
                if (automation.notice) {
                    (0, cliShellConfig_1.writeFeedback)(automation.notice);
                }
                (0, cliShellUi_1.printOutputPanel)(automation.panel);
                if (state.candidatePicker) {
                    (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                }
                if (automation.clearSession) {
                    (0, cliShellConfig_1.clearCandidatePicker)(state);
                    state.session = null;
                    state.rootTask = null;
                }
                else if (state.session && !state.candidatePicker) {
                    printSessionStatus(state, state.session);
                }
                return;
            }
            printSessionStatus(state, session);
            (0, cliShellUi_1.printOutputPanel)(preview);
            if (state.candidatePicker) {
                (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
            }
            return;
        }
        (0, cliShellConfig_1.flushFeedback)(feedback);
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
        const changedKey = session.pending.key;
        session.pending = null;
        (0, cliShellConfig_1.flushFeedback)(feedback);
        const { automation, preview } = applyValueChangeEffects(state, session, changedKey);
        if (automation) {
            if (automation.notice) {
                (0, cliShellConfig_1.writeFeedback)(automation.notice);
            }
            (0, cliShellUi_1.printOutputPanel)(automation.panel);
            if (state.candidatePicker) {
                (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
            }
            if (automation.clearSession) {
                (0, cliShellConfig_1.clearCandidatePicker)(state);
                state.session = null;
                state.rootTask = null;
            }
            else if (state.session && !state.candidatePicker) {
                printSessionStatus(state, state.session);
            }
            return;
        }
        printSessionStatus(state, session);
        (0, cliShellUi_1.printOutputPanel)(preview);
        if (state.candidatePicker) {
            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
        }
        return;
    }
    (0, cliShellConfig_1.flushFeedback)(feedback);
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
const resolveCandidateSelectionInput = (state, rawValue) => {
    const picker = state.candidatePicker;
    if (!picker) {
        return null;
    }
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
        return picker.candidates[(0, cliShellConfig_1.clamp)(picker.selectedIndex, 0, picker.candidates.length - 1)]?.path ?? null;
    }
    if (/^\d+$/.test(trimmed)) {
        const index = Number(trimmed) - 1;
        if (index >= 0 && index < picker.candidates.length) {
            picker.selectedIndex = index;
            return picker.candidates[index]?.path ?? null;
        }
        return null;
    }
    return (0, shellPathInput_1.normalizeShellInput)(rawValue);
};
const ROOT_SYSTEM_MENU_ENTRIES = cliShellConfig_1.SHELL_BUILTIN_COMMANDS.map((entry) => ({
    ...entry,
    kind: "system",
}));
const SESSION_SYSTEM_MENU_ENTRIES = [
    { name: "last", summary: "Show the last remembered URDF path.", kind: "system" },
    { name: "clear", summary: "Clear the current shell view.", kind: "system" },
];
const buildRootShellMenuEntries = (names) => names
    .map((name) => getRootShellCommandDefinition(name))
    .filter((entry) => Boolean(entry))
    .map((entry) => ({
    name: entry.name,
    summary: entry.summary,
    kind: "flow",
}));
const START_ROOT_MENU_ENTRIES = buildRootShellMenuEntries(cliShellConfig_1.ROOT_START_COMMAND_NAMES);
const LOADED_ROOT_MENU_ENTRIES = buildRootShellMenuEntries(cliShellConfig_1.ROOT_READY_COMMAND_NAMES);
const AUTO_RUN_READY_COMMANDS = new Set([
    "analyze",
    "validate",
    "health-check",
    "guess-orientation",
    "inspect-repo",
]);
const SOURCE_OPTION_KEYS = new Set(["urdf", "local", "github", "xacro", "path"]);
const getLoadedRootCommandList = () => LOADED_ROOT_MENU_ENTRIES.map(({ name, summary }) => ({ name, summary }));
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
const getFullRootMenuEntries = () => {
    const seen = new Set();
    const entries = [];
    const addEntry = (entry) => {
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
const getRootMenuEntries = (state) => {
    if (state.rootTask) {
        return getFullRootMenuEntries();
    }
    if (getReadySourceLabel(state)) {
        const seen = new Set();
        const entries = [];
        const addEntry = (entry) => {
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
const getSessionMenuEntries = (session) => {
    const entries = shouldSuppressSessionOptionMenu(session)
        ? []
        : getVisibleSessionOptionEntries(session).map((entry) => ({
            name: entry.name,
            summary: entry.summary,
            kind: "option",
        }));
    for (const entry of cliShellConfig_1.SESSION_BUILTIN_COMMANDS) {
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
const matchMenuEntries = (entries, query) => {
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
const filterMenuEntries = (entries, query) => matchMenuEntries(entries, query).entries;
const getSlashMenuEntries = (state, input) => {
    if (!shouldTreatAsSlashInput(input.trimStart(), state)) {
        return [];
    }
    const parsed = parseSlashInput(input.trimStart());
    if (!parsed || parsed.inlineValue) {
        return [];
    }
    const primaryEntries = matchMenuEntries(state.session ? getSessionMenuEntries(state.session) : getRootMenuEntries(state), parsed.slashCommand);
    if (state.session ||
        state.rootTask ||
        !state.lastUrdfPath ||
        !parsed.slashCommand ||
        primaryEntries.matchKind === "startsWith" ||
        primaryEntries.matchKind === "all") {
        return primaryEntries.entries;
    }
    const fallbackEntries = matchMenuEntries(getFullRootMenuEntries(), parsed.slashCommand);
    if (fallbackEntries.matchKind === "startsWith") {
        return fallbackEntries.entries;
    }
    return primaryEntries.matchKind !== "none" ? primaryEntries.entries : fallbackEntries.entries;
};
const appendTimelineEntry = (view, entry) => {
    view.timeline = [...view.timeline.slice(-11), entry];
};
const pushTimelineUserEntry = (view, text) => {
    appendTimelineEntry(view, {
        role: "user",
        lines: [text],
        kind: "info",
    });
};
const compactTimelineLines = (lines, maxLines = 8) => {
    if (lines.length <= maxLines) {
        return lines;
    }
    return [...lines.slice(0, maxLines), `+${lines.length - maxLines} more`];
};
const buildTimelineResponseLines = (notice, panel, fallbackText) => {
    const lines = [];
    const kind = notice?.kind ?? panel?.kind ?? "info";
    const shouldIncludeNoticeText = !panel ||
        !notice?.text ||
        !new Set(["run complete", "preview ready", "health preview ready", "showing the current context"]).has(notice.text);
    const panelNarrative = panel?.title === "loaded"
        ? "loaded the source"
        : panel?.title === "checks"
            ? "checked the source"
            : panel?.title === "repair"
                ? "updated the working copy"
                : panel?.title === "doctor"
                    ? "checked the local runtime"
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
const pushTimelineAssistantEntry = (view, lines, kind = "info") => {
    if (lines.length === 0) {
        return;
    }
    appendTimelineEntry(view, {
        role: "assistant",
        lines: compactTimelineLines(lines),
        kind,
    });
};
const archiveAssistantStateToTimeline = (view, options = {}) => {
    const built = buildTimelineResponseLines(view.notice, view.output, options.fallbackText);
    if (built) {
        pushTimelineAssistantEntry(view, built.lines, built.kind);
    }
    if (options.clear !== false) {
        view.notice = null;
        view.output = null;
    }
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
    const normalizedSelectedIndex = (0, cliShellConfig_1.clamp)(selectedIndex, 0, entries.length - 1);
    const visibleCount = (0, cliShellConfig_1.clamp)(maxVisible, 1, entries.length);
    const start = (0, cliShellConfig_1.clamp)(normalizedSelectedIndex - Math.floor(visibleCount / 2), 0, Math.max(entries.length - visibleCount, 0));
    return {
        selectedIndex: normalizedSelectedIndex,
        start,
        visible: entries.slice(start, start + visibleCount),
    };
};
const buildSessionPreviewText = (state, session) => {
    const lines = getSessionContextRows(state, session).map((row) => `${row.label} ${row.value}`);
    lines.push("");
    lines.push(`command ${(0, cliShellConfig_1.buildCommandPreview)(session.command, session.args)}`);
    if (session.args.size > 0) {
        for (const [key, value] of session.args.entries()) {
            lines.push(`${getSlashDisplayName(session, key)}${(0, cliShellConfig_1.formatInlineValue)(value === true ? "enabled" : String(value))}`);
        }
    }
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
            return cliShellConfig_1.SHELL_THEME.success(text);
        case "warning":
            return cliShellConfig_1.SHELL_THEME.warning(text);
        case "error":
            return cliShellConfig_1.SHELL_THEME.error(text);
        case "info":
            return cliShellConfig_1.SHELL_THEME.muted(text);
    }
};
const renderTimelineEntryLine = (entry, line, first) => {
    if (entry.role === "user") {
        return `  ${cliShellConfig_1.SHELL_THEME.command(">")} ${cliShellConfig_1.SHELL_THEME.command(line)}`;
    }
    const icon = first ? (0, cliShellUi_1.getPanelLineIcon)(line) : "·";
    const text = entry.kind === "error"
        ? cliShellConfig_1.SHELL_THEME.error(line)
        : entry.kind === "warning"
            ? cliShellConfig_1.SHELL_THEME.warning(line)
            : entry.kind === "success" && first
                ? cliShellConfig_1.SHELL_THEME.success(line)
                : cliShellConfig_1.SHELL_THEME.muted(line);
    return `  ${cliShellConfig_1.SHELL_THEME.icon(icon)} ${text}`;
};
const shouldRenderInlineNotice = (view) => {
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
const renderMenuEntry = (entry, selected, width) => {
    const badge = entry.kind === "task"
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
    return selected ? cliShellConfig_1.SHELL_THEME.selected(line) : `${cliShellConfig_1.SHELL_THEME.command(left)}${cliShellConfig_1.SHELL_THEME.muted(`${summary}${badgeSuffix}`)}`;
};
const getPromptPlaceholder = (state) => {
    if (!state.session && !state.rootTask && !state.candidatePicker && state.updatePrompt) {
        return "Enter updates now or Esc skips";
    }
    if (!state.session && !state.rootTask && !state.candidatePicker && state.suggestedAction) {
        return "Enter accepts the recommendation";
    }
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
        .map((step) => formatSlashSequence(state.session, step))
        .join(" or ")}`;
};
const renderTtyShell = (state, view) => {
    const columns = process.stdout.columns ?? 100;
    const rows = process.stdout.rows ?? 24;
    const menuEntries = getSlashMenuEntries(state, view.input);
    const menuWindow = getMenuWindow(menuEntries, view.menuIndex, Math.max(4, Math.min(8, rows - 16)));
    view.menuIndex = menuWindow.selectedIndex;
    const lines = [];
    lines.push(`${cliShellConfig_1.SHELL_THEME.brand(cliShellConfig_1.SHELL_BRAND)} ${cliShellConfig_1.SHELL_THEME.muted("ilu interactive urdf shell")}`);
    lines.push(cliShellConfig_1.SHELL_THEME.muted("paste owner/repo or drop a local path  / shows actions  !xacro sets up xacro  ctrl+c exits"));
    if (state.candidatePicker && state.session) {
        const selectedCandidate = state.candidatePicker.candidates[(0, cliShellConfig_1.clamp)(state.candidatePicker.selectedIndex, 0, state.candidatePicker.candidates.length - 1)];
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
            lines.push((0, cliShellUi_1.renderContextRow)(row));
        }
        if (selectedCandidate) {
            const selectedDetails = (0, cliShellRecommendations_1.getCandidateDetails)(selectedCandidate);
            if (selectedDetails.length > 0) {
                lines.push(`  ${cliShellConfig_1.SHELL_THEME.muted("details".padEnd(12))} ${cliShellConfig_1.SHELL_THEME.muted(selectedDetails.join("  "))}`);
            }
        }
    }
    else if (state.session) {
        for (const row of getSessionContextRows(state, state.session)) {
            lines.push((0, cliShellUi_1.renderContextRow)(row));
        }
    }
    else if (state.rootTask) {
        lines.push((0, cliShellUi_1.renderContextRow)({ label: "source", value: "none yet", tone: "muted" }));
        lines.push((0, cliShellUi_1.renderContextRow)({ label: "action", value: getRootTaskSummary(state.rootTask), tone: "muted" }));
        lines.push((0, cliShellUi_1.renderContextRow)({ label: "next", value: "paste input directly or type /", tone: "accent" }));
    }
    else {
        for (const row of getLoadedSourceContextRows(state)) {
            lines.push((0, cliShellUi_1.renderContextRow)(row));
        }
        if (!getReadySourceLabel(state)) {
            lines.push((0, cliShellUi_1.renderContextRow)({ label: "help", value: "/ shows direct actions when you need them", tone: "muted" }));
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
        lines.push(`  ${cliShellConfig_1.SHELL_THEME.icon("…")} ${cliShellConfig_1.SHELL_THEME.muted(`${view.busy.title}  ${view.busy.lines.join("  ")}`)}`);
    }
    if (state.updatePrompt && !view.busy) {
        lines.push(`  ${cliShellConfig_1.SHELL_THEME.icon("↑")} ${cliShellConfig_1.SHELL_THEME.muted((0, cliShellConfig_1.formatUpdatePromptLine)(state.updatePrompt))}`);
    }
    if (state.suggestedAction && !view.busy && !state.session && !state.rootTask && !state.candidatePicker) {
        lines.push(`  ${cliShellConfig_1.SHELL_THEME.icon("→")} ${cliShellConfig_1.SHELL_THEME.muted(state.suggestedAction.prompt)}`);
    }
    if (shouldRenderInlineNotice(view)) {
        lines.push(`  ${renderNotice(view.notice)}`);
    }
    const promptLabel = (0, cliShellConfig_1.formatShellPrompt)(state).trimEnd();
    const promptLineIndex = lines.length;
    const shouldShowPlaceholder = view.input.length === 0 &&
        !view.busy &&
        (view.timeline.length === 0 || Boolean(state.session) || Boolean(state.candidatePicker));
    const placeholder = shouldShowPlaceholder ? getPromptPlaceholder(state) : "";
    lines.push(`${cliShellConfig_1.SHELL_THEME.command(promptLabel)} ${view.input}${view.busy ? cliShellConfig_1.SHELL_THEME.muted("working...") : placeholder ? cliShellConfig_1.SHELL_THEME.muted(placeholder) : ""}`);
    if (state.session?.pending && !view.input.startsWith("/")) {
        const hasExamples = state.session.pending.examples.length > 0;
        const hasNotes = state.session.pending.notes.length > 0;
        if (hasExamples) {
            lines.push(cliShellConfig_1.SHELL_THEME.section("examples"));
            for (const example of state.session.pending.examples.slice(0, 2)) {
                lines.push(`  ${cliShellConfig_1.SHELL_THEME.muted(example)}`);
            }
        }
        if (hasNotes) {
            lines.push(cliShellConfig_1.SHELL_THEME.section("note"));
            for (const note of state.session.pending.notes) {
                lines.push(`  ${cliShellConfig_1.SHELL_THEME.warning(truncateText(note, columns - 4))}`);
            }
        }
    }
    else if (state.candidatePicker && !view.input.startsWith("/")) {
        lines.push(cliShellConfig_1.SHELL_THEME.section("picker"));
        for (const [index, candidate] of state.candidatePicker.candidates.slice(0, 8).entries()) {
            const details = (0, cliShellRecommendations_1.getCandidateDetails)(candidate);
            const line = `${candidate.path}${details.length > 0 ? `  ${details.join("  ")}` : ""}`;
            const selected = index === state.candidatePicker.selectedIndex;
            lines.push(selected
                ? `  ${cliShellConfig_1.SHELL_THEME.selected(` ${truncateText(line, columns - 6)} `)}`
                : `  ${cliShellConfig_1.SHELL_THEME.command(candidate.path)}${details.length > 0 ? `  ${cliShellConfig_1.SHELL_THEME.muted(truncateText(details.join("  "), columns - candidate.path.length - 8))}` : ""}`);
        }
        if (state.candidatePicker.candidates.length > 8) {
            lines.push(`  ${cliShellConfig_1.SHELL_THEME.muted("...")}`);
        }
    }
    else if (shouldTreatAsSlashInput(view.input, state)) {
        lines.push(cliShellConfig_1.SHELL_THEME.section("picker"));
        if (menuEntries.length === 0) {
            lines.push(`  ${cliShellConfig_1.SHELL_THEME.warning("no matches")}`);
        }
        else {
            if (menuWindow.start > 0) {
                lines.push(`  ${cliShellConfig_1.SHELL_THEME.muted("...")}`);
            }
            for (const [index, entry] of menuWindow.visible.entries()) {
                lines.push(renderMenuEntry(entry, menuWindow.start + index === menuWindow.selectedIndex, columns - 2));
            }
            if (menuWindow.start + menuWindow.visible.length < menuEntries.length) {
                lines.push(`  ${cliShellConfig_1.SHELL_THEME.muted("...")}`);
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
    process.stdout.write(`\u001b[${(0, cliShellConfig_1.stripAnsi)(`${promptLabel} ${view.input}`).length}C`);
};
const completeTtyPathInput = (input, state) => {
    if (state.session?.pending && state.session.pending.expectsPath) {
        const matches = completePathFragment((0, shellPathInput_1.normalizeFilesystemInput)(input));
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
        const matches = completePathFragment((0, shellPathInput_1.normalizeFilesystemInput)(input));
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
    const selected = menuEntries[(0, cliShellConfig_1.clamp)(selectedIndex, 0, menuEntries.length - 1)];
    return selected ? `/${selected.name}` : null;
};
const startStartupUpdateCheck = (state, onAvailable) => {
    void (0, cliUpdate_1.checkForUpdateAvailability)().then((update) => {
        if (!update || state.updatePrompt) {
            return;
        }
        state.updatePrompt = update;
        onAvailable(update);
    });
};
const runLineInteractiveShell = async (options = {}) => {
    const state = {
        session: null,
        rootTask: null,
        candidatePicker: null,
        xacroRetry: null,
        loadedSource: null,
        updatePrompt: null,
        suggestedAction: null,
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
    (0, cliShellUi_1.printRootQuickStart)();
    if (options.initialSlashCommand) {
        const parsed = parseSlashInput(options.initialSlashCommand);
        if (parsed) {
            handleRootSlashCommand(parsed.slashCommand, state, close);
        }
    }
    rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
    rl.prompt();
    for await (const line of rl) {
        const trimmed = line.trim();
        const session = state.session;
        const isSlashInput = shouldTreatAsSlashInput(line, state);
        const bangCommand = parseBangInput(line);
        if (state.suggestedAction && trimmed.length > 0) {
            (0, cliShellConfig_1.clearSuggestedAction)(state);
        }
        if (bangCommand) {
            if (bangCommand === "xacro") {
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("setting up xacro runtime...")}\n`);
                const result = runXacroBangCommand(state);
                (0, cliShellConfig_1.writeFeedback)(result.notice);
                (0, cliShellUi_1.printOutputPanel)(result.panel);
                if (result.clearSession) {
                    state.session = null;
                    state.rootTask = null;
                }
            }
        }
        else if (state.candidatePicker && !isSlashInput) {
            const selectedPath = resolveCandidateSelectionInput(state, line);
            if (selectedPath) {
                const result = runSelectedCandidatePicker(state, selectedPath);
                if (result?.notice) {
                    (0, cliShellConfig_1.writeFeedback)(result.notice);
                }
                (0, cliShellUi_1.printOutputPanel)(result?.panel ?? null);
                if (result?.clearSession) {
                    (0, cliShellConfig_1.clearCandidatePicker)(state);
                    state.session = null;
                    state.rootTask = null;
                }
            }
            else {
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.warning("pick a valid number or paste a repo entry path")}\n`);
                if (state.candidatePicker) {
                    (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                }
            }
        }
        else if (session?.pending && !isSlashInput) {
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
            if (!state.session && !state.rootTask && !state.candidatePicker && state.suggestedAction) {
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("applying the recommended fix...")}\n`);
                const result = runSuggestedAction(state);
                if (result.notice) {
                    (0, cliShellConfig_1.writeFeedback)(result.notice);
                }
                (0, cliShellUi_1.printOutputPanel)(result.panel);
            }
            else if (session) {
                if (!session.pending && getRequirementStatus(session).ready) {
                    printSessionCommandExecution(state, executeSessionCommand(state, session), session);
                }
                else {
                    printSessionStatus(state, session);
                }
            }
            else if (state.rootTask) {
                printRootTaskOptions(state.rootTask);
            }
            else {
                printRootOptions(state);
            }
        }
        else if (session) {
            const feedback = [];
            const applied = applyFreeformInputToSession(session, line, feedback);
            if (applied) {
                const automated = runDirectInputAutomation(state, applied.session, applied.key);
                if (automated) {
                    if (automated.notice) {
                        (0, cliShellConfig_1.writeFeedback)(automated.notice);
                    }
                    (0, cliShellUi_1.printOutputPanel)(automated.panel);
                    if (state.candidatePicker) {
                        (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                    }
                    if (automated.clearSession) {
                        (0, cliShellConfig_1.clearCandidatePicker)(state);
                        state.session = null;
                        state.rootTask = null;
                    }
                    else if (state.session) {
                        if (!state.candidatePicker) {
                            printSessionStatus(state, state.session);
                        }
                    }
                }
                else {
                    printSessionStatus(state, session);
                    (0, cliShellUi_1.printOutputPanel)(buildAutoPreviewPanel(state, applied.session, applied.key));
                    if (state.candidatePicker) {
                        (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                    }
                }
            }
            else {
                (0, cliShellConfig_1.flushFeedback)(feedback);
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("type /, drop a local path, or paste owner/repo")}\n`);
            }
        }
        else {
            const feedback = [];
            const applied = applyFreeformInputToRootState(state, line, feedback);
            if (applied && state.session) {
                const automated = runDirectInputAutomation(state, applied.session, applied.key);
                if (automated) {
                    if (automated.notice) {
                        (0, cliShellConfig_1.writeFeedback)(automated.notice);
                    }
                    (0, cliShellUi_1.printOutputPanel)(automated.panel);
                    if (state.candidatePicker) {
                        (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                    }
                    if (automated.clearSession) {
                        (0, cliShellConfig_1.clearCandidatePicker)(state);
                        state.session = null;
                        state.rootTask = null;
                    }
                    else if (state.session) {
                        if (!state.candidatePicker) {
                            printSessionStatus(state, state.session);
                        }
                    }
                }
                else {
                    printSessionStatus(state, state.session);
                    (0, cliShellUi_1.printOutputPanel)(buildAutoPreviewPanel(state, applied.session, applied.key));
                    if (state.candidatePicker) {
                        (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                    }
                }
            }
            else {
                (0, cliShellConfig_1.flushFeedback)(feedback);
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("type /, drop a local path, or paste owner/repo")}\n`);
            }
        }
        if (!isClosed && state.suggestedAction && !state.session && !state.rootTask && !state.candidatePicker) {
            process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(state.suggestedAction.prompt)}\n`);
        }
        if (isClosed) {
            break;
        }
        rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
        rl.prompt();
    }
};
const runTtyInteractiveShell = async (options = {}) => {
    const state = {
        session: null,
        rootTask: null,
        candidatePicker: null,
        xacroRetry: null,
        loadedSource: null,
        updatePrompt: null,
        suggestedAction: null,
    };
    const view = {
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
    const setInput = (nextInput) => {
        view.input = nextInput;
        const menuEntries = getSlashMenuEntries(state, view.input);
        view.menuIndex = menuEntries.length === 0 ? 0 : (0, cliShellConfig_1.clamp)(view.menuIndex, 0, menuEntries.length - 1);
    };
    const openSession = (command) => {
        const feedback = [];
        state.rootTask = null;
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        state.session = createSession(command, state, command, feedback);
        setNoticeFromFeedback(view, feedback);
        setInput(state.session?.pending ? "" : "/");
        pushTimelineUserEntry(view, `/${command}`);
        if (state.session) {
            pushTimelineAssistantEntry(view, buildSessionNarrativeLines(state, state.session), "info");
            view.notice = null;
        }
    };
    const openRootTask = (task) => {
        state.rootTask = task;
        state.session = null;
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        setInput("/");
        view.notice = { kind: "info", text: `${getRootTaskSummary(task)}  choose below or paste input directly` };
        pushTimelineUserEntry(view, `/${task}`);
        pushTimelineAssistantEntry(view, [`action ${getRootTaskSummary(task)}`, "next paste input directly or type /"], "info");
        view.notice = null;
    };
    const getBusyStateForSession = (session, changedKey) => {
        if (session.command === "load-source") {
            if (changedKey === "github" ||
                (typeof session.args.get("github") === "string" && String(session.args.get("github")).trim().length > 0)) {
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
    const syncInputAfterSlashAction = (parsed) => {
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
            pushTimelineUserEntry(view, "/last");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "run") {
            (0, cliShellConfig_1.clearCandidatePicker)(state);
            view.notice = {
                kind: "info",
                text: getRootIdleMessage(state),
            };
            pushTimelineUserEntry(view, "/run");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "update") {
            (0, cliShellConfig_1.dismissUpdatePrompt)(state);
            try {
                (0, cliUpdate_1.runUpdateCommand)();
                view.notice = { kind: "success", text: "ilu is up to date." };
            }
            catch (error) {
                view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
            }
            pushTimelineUserEntry(view, "/update");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "doctor") {
            const result = runDoctorShellCommand();
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/doctor");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        const rootShellCommand = getRootShellCommandDefinition(slashCommand);
        if (rootShellCommand) {
            const feedback = [];
            startRootShellCommand(rootShellCommand, state, feedback);
            setNoticeFromFeedback(view, feedback);
            if (state.session && shouldAutoRunSession(state.session)) {
                const execution = runBusyOperation(getBusyStateForSession(state.session), () => executeSessionCommand(state, state.session));
                const compactFailurePanel = execution.status !== 0 ? getShellExecutionFailurePanel(execution, state.session.command) : null;
                if (compactFailurePanel) {
                    view.output = compactFailurePanel;
                    view.notice = buildShellFailureNotice(compactFailurePanel, `[${state.session.command}] exited with status ${execution.status}`);
                }
                else {
                    const successPanel = getShellExecutionSuccessPanel(state, state.session, execution);
                    view.output =
                        successPanel ??
                            (0, cliShellUi_1.createOutputPanel)(execution.status === 0 ? "result" : "error", buildExecutionPanelText(execution, state.session.command), execution.status === 0 ? "success" : "error");
                    view.notice =
                        execution.status === 0
                            ? { kind: "success", text: "run complete" }
                            : { kind: "error", text: `[${state.session.command}] exited with status ${execution.status}` };
                }
                state.session = null;
                state.rootTask = null;
            }
            else if (state.session?.pending) {
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
        if (!(slashCommand in cliCompletion_1.COMMAND_COMPLETION_SPEC_BY_NAME)) {
            view.notice = { kind: "error", text: `Unknown slash command: /${slashCommand}` };
            return true;
        }
        const command = slashCommand;
        const quickSession = tryCreateLoadedRootQuickSession(state, command);
        if (quickSession) {
            (0, cliShellConfig_1.clearCandidatePicker)(state);
            (0, cliShellConfig_1.clearXacroRetry)(state);
            const execution = runBusyOperation(getBusyStateForSession(quickSession), () => executeSessionCommand(state, quickSession));
            const compactFailurePanel = execution.status !== 0 ? getShellExecutionFailurePanel(execution, quickSession.command) : null;
            if (compactFailurePanel) {
                view.output = compactFailurePanel;
                view.notice = buildShellFailureNotice(compactFailurePanel, `[${quickSession.command}] exited with status ${execution.status}`);
            }
            else {
                const successPanel = getShellExecutionSuccessPanel(state, quickSession, execution);
                view.output =
                    successPanel ??
                        (0, cliShellUi_1.createOutputPanel)(execution.status === 0 ? "result" : "error", buildExecutionPanelText(execution, quickSession.command), execution.status === 0 ? "success" : "error");
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
            (0, cliShellConfig_1.clearCandidatePicker)(state);
            (0, cliShellConfig_1.clearXacroRetry)(state);
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
            (0, cliShellConfig_1.clearCandidatePicker)(state);
            view.notice = {
                kind: "info",
                text: "nothing is pending here. paste a source or choose one of the direct actions",
            };
            pushTimelineUserEntry(view, "/run");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "update") {
            (0, cliShellConfig_1.dismissUpdatePrompt)(state);
            try {
                (0, cliUpdate_1.runUpdateCommand)();
                view.notice = { kind: "success", text: "ilu is up to date." };
            }
            catch (error) {
                view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
            }
            pushTimelineUserEntry(view, "/update");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "doctor") {
            const result = runDoctorShellCommand();
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/doctor");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (cliShellConfig_1.ROOT_TASKS.some((entry) => entry.name === slashCommand)) {
            openRootTask(slashCommand);
            return true;
        }
        const action = findRootTaskAction(task, slashCommand);
        if (action) {
            const feedback = [];
            startRootTaskAction(task, action, state, feedback);
            setNoticeFromFeedback(view, feedback);
            if (state.session && shouldAutoRunSession(state.session)) {
                const execution = runBusyOperation(getBusyStateForSession(state.session), () => executeSessionCommand(state, state.session));
                const compactFailurePanel = execution.status !== 0 ? getShellExecutionFailurePanel(execution, state.session.command) : null;
                if (compactFailurePanel) {
                    view.output = compactFailurePanel;
                    view.notice = buildShellFailureNotice(compactFailurePanel, `[${state.session.command}] exited with status ${execution.status}`);
                }
                else {
                    const successPanel = getShellExecutionSuccessPanel(state, state.session, execution);
                    view.output =
                        successPanel ??
                            (0, cliShellUi_1.createOutputPanel)(execution.status === 0 ? "result" : "error", buildExecutionPanelText(execution, state.session.command), execution.status === 0 ? "success" : "error");
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
            (0, cliShellConfig_1.clearCandidatePicker)(state);
            (0, cliShellConfig_1.clearXacroRetry)(state);
            state.session = null;
            view.notice = { kind: "info", text: state.rootTask ? `back to /${state.rootTask}` : "back to tasks" };
            setInput(state.rootTask ? "/" : "");
            pushTimelineUserEntry(view, "/back");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "reset") {
            const feedback = [];
            (0, cliShellConfig_1.clearCandidatePicker)(state);
            (0, cliShellConfig_1.clearXacroRetry)(state);
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
            view.output = (0, cliShellUi_1.createOutputPanel)("context", buildSessionPreviewText(state, session));
            view.notice = { kind: "info", text: "showing the current context" };
            pushTimelineUserEntry(view, "/show");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "run") {
            (0, cliShellConfig_1.clearCandidatePicker)(state);
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
            const execution = runBusyOperation(getBusyStateForSession(session), () => executeSessionCommand(state, session));
            const compactFailurePanel = execution.status !== 0 ? getShellExecutionFailurePanel(execution, session.command) : null;
            if (compactFailurePanel) {
                view.output = compactFailurePanel;
                view.notice = buildShellFailureNotice(compactFailurePanel, `[${session.command}] exited with status ${execution.status}`);
                pushTimelineUserEntry(view, "/run");
                archiveAssistantStateToTimeline(view);
                return true;
            }
            const successPanel = getShellExecutionSuccessPanel(state, session, execution);
            view.output =
                successPanel ??
                    (0, cliShellUi_1.createOutputPanel)(execution.status === 0 ? "result" : "error", buildExecutionPanelText(execution, session.command), execution.status === 0 ? "success" : "error");
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
            (0, cliShellConfig_1.dismissUpdatePrompt)(state);
            try {
                (0, cliUpdate_1.runUpdateCommand)();
                view.notice = { kind: "success", text: "ilu is up to date." };
            }
            catch (error) {
                view.notice = { kind: "error", text: error instanceof Error ? error.message : String(error) };
            }
            pushTimelineUserEntry(view, "/update");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "doctor") {
            const result = runDoctorShellCommand();
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/doctor");
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
            const feedback = [];
            (0, cliShellConfig_1.clearCandidatePicker)(state);
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
            const feedback = [];
            if (setSessionValue(session, target.key, inlineValue, feedback)) {
                session.pending = null;
                const { automation, preview } = runBusyOperation(getBusyStateForSession(session, target.key), () => applyValueChangeEffects(state, session, target.key));
                if (automation) {
                    view.notice = automation.notice;
                    view.output = automation.panel;
                    if (automation.clearSession) {
                        (0, cliShellConfig_1.clearCandidatePicker)(state);
                        state.session = null;
                        state.rootTask = null;
                    }
                }
                else {
                    setNoticeFromFeedback(view, feedback);
                    view.output = preview;
                }
                pushTimelineUserEntry(view, `/${slashCommand}${(0, cliShellConfig_1.formatInlineValue)(inlineValue)}`);
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
        const feedback = [];
        if (setSessionValue(session, session.pending.key, view.input, feedback)) {
            pushTimelineUserEntry(view, `/${session.pending.slashName}${(0, cliShellConfig_1.formatInlineValue)(view.input)}`);
            const changedKey = session.pending.key;
            session.pending = null;
            const { automation, preview } = runBusyOperation(getBusyStateForSession(session, changedKey), () => applyValueChangeEffects(state, session, changedKey));
            if (automation) {
                view.notice = automation.notice;
                view.output = automation.panel;
                if (automation.clearSession) {
                    (0, cliShellConfig_1.clearCandidatePicker)(state);
                    state.session = null;
                    state.rootTask = null;
                }
            }
            else {
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
        if (state.updatePrompt &&
            !state.session &&
            !state.rootTask &&
            !state.candidatePicker &&
            trimmed.length === 0) {
            const update = state.updatePrompt;
            (0, cliShellConfig_1.dismissUpdatePrompt)(state);
            pushTimelineUserEntry(view, "/update");
            try {
                runBusyOperation({
                    title: "updating",
                    lines: ["installing the latest ilu release...", "restart ilu when the install finishes..."],
                }, () => (0, cliUpdate_1.runUpdateCommand)());
                view.notice = {
                    kind: "success",
                    text: `updated to ${update.latestVersion}. restart ilu to use the new build`,
                };
                view.output = (0, cliShellUi_1.createOutputPanel)("update", `updated ${update.currentVersion} -> ${update.latestVersion}\nrestart ilu to use the new build`, "success");
            }
            catch (error) {
                view.notice = {
                    kind: "error",
                    text: error instanceof Error ? error.message : String(error),
                };
                view.output = null;
            }
            archiveAssistantStateToTimeline(view);
            setInput("");
            return;
        }
        if (state.suggestedAction &&
            !state.session &&
            !state.rootTask &&
            !state.candidatePicker &&
            trimmed.length === 0) {
            const acceptedAction = state.suggestedAction.acceptLabel;
            pushTimelineUserEntry(view, `yes, ${acceptedAction}`);
            const result = runBusyOperation(getSuggestedActionBusyState(state.suggestedAction), () => runSuggestedAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            archiveAssistantStateToTimeline(view);
            setInput("");
            return;
        }
        if (bangCommand) {
            if (bangCommand === "xacro") {
                pushTimelineUserEntry(view, "!xacro");
                const result = runBusyOperation({
                    title: "xacro",
                    lines: ["setting up xacro runtime...", "this can take a moment..."],
                }, () => runXacroBangCommand(state));
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
                const result = runBusyOperation({
                    title: "loading",
                    lines: ["loading selected entry...", "running validation and health check..."],
                }, () => runSelectedCandidatePicker(state, selectedPath));
                view.notice = result?.notice ?? { kind: "error", text: "could not load candidate" };
                view.output = result?.panel ?? null;
                if (result?.clearSession) {
                    (0, cliShellConfig_1.clearCandidatePicker)(state);
                    state.session = null;
                    state.rootTask = null;
                }
                archiveAssistantStateToTimeline(view);
            }
            else {
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
                    const selected = menuEntries[(0, cliShellConfig_1.clamp)(view.menuIndex, 0, menuEntries.length - 1)];
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
                        syncInputAfterSlashAction({ slashCommand: selected.name, inlineValue: "" });
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
                text: state.session || state.rootTask ? getPromptPlaceholder(state) : cliShellConfig_1.ROOT_GUIDANCE,
            };
            return;
        }
        if (state.session) {
            const feedback = [];
            const submittedInput = view.input.trim();
            const applied = applyFreeformInputToSession(state.session, view.input, feedback);
            if (applied) {
                const automated = runBusyOperation(getBusyStateForSession(applied.session, applied.key), () => runDirectInputAutomation(state, applied.session, applied.key));
                if (automated) {
                    view.notice = automated.notice;
                    view.output = automated.panel;
                    if (automated.clearSession) {
                        (0, cliShellConfig_1.clearCandidatePicker)(state);
                        state.session = null;
                        state.rootTask = null;
                    }
                }
                else {
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
        else {
            const feedback = [];
            const submittedInput = view.input.trim();
            const applied = applyFreeformInputToRootState(state, view.input, feedback);
            if (applied && state.session) {
                const automated = runBusyOperation(getBusyStateForSession(applied.session, applied.key), () => runDirectInputAutomation(state, applied.session, applied.key));
                if (automated) {
                    view.notice = automated.notice;
                    view.output = automated.panel;
                    if (automated.clearSession) {
                        (0, cliShellConfig_1.clearCandidatePicker)(state);
                        state.session = null;
                        state.rootTask = null;
                    }
                }
                else {
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
    const runBusyOperation = (busy, operation) => {
        setInput("");
        view.busy = busy;
        queueRender("force");
        try {
            return operation();
        }
        finally {
            view.busy = null;
            ignoreKeypressUntilMs = Date.now() + 200;
        }
    };
    let pendingRenderTimer = null;
    let renderQueued = false;
    let lastRenderAt = 0;
    const queueRender = (mode = "navigation") => {
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
    startStartupUpdateCheck(state, () => {
        if (closed ||
            view.input.length > 0 ||
            view.timeline.length > 0 ||
            state.session ||
            state.rootTask ||
            state.candidatePicker) {
            (0, cliShellConfig_1.dismissUpdatePrompt)(state);
            return;
        }
        queueRender("force");
    });
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onResize = () => {
        queueRender("force");
    };
    const onKeypress = (input, key) => {
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
                state.candidatePicker.selectedIndex = (0, cliShellConfig_1.clamp)(state.candidatePicker.selectedIndex - 1, 0, state.candidatePicker.candidates.length - 1);
                queueRender("navigation");
                return;
            }
            const menuEntries = getSlashMenuEntries(state, view.input);
            if (menuEntries.length > 0) {
                view.menuIndex = (0, cliShellConfig_1.clamp)(view.menuIndex - 1, 0, menuEntries.length - 1);
                queueRender("navigation");
            }
            return;
        }
        if (key.name === "down") {
            if (state.candidatePicker && !view.input.startsWith("/")) {
                state.candidatePicker.selectedIndex = (0, cliShellConfig_1.clamp)(state.candidatePicker.selectedIndex + 1, 0, state.candidatePicker.candidates.length - 1);
                queueRender("navigation");
                return;
            }
            const menuEntries = getSlashMenuEntries(state, view.input);
            if (menuEntries.length > 0) {
                view.menuIndex = (0, cliShellConfig_1.clamp)(view.menuIndex + 1, 0, menuEntries.length - 1);
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
            if (state.updatePrompt && view.input.length === 0 && !state.session && !state.rootTask && !state.candidatePicker) {
                (0, cliShellConfig_1.dismissUpdatePrompt)(state);
                queueRender("navigation");
                return;
            }
            if (state.suggestedAction && view.input.length === 0 && !state.session && !state.rootTask && !state.candidatePicker) {
                (0, cliShellConfig_1.clearSuggestedAction)(state);
                queueRender("navigation");
                return;
            }
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
            if (state.updatePrompt && !state.session && !state.rootTask && !state.candidatePicker && view.input.length === 0) {
                (0, cliShellConfig_1.dismissUpdatePrompt)(state);
            }
            if (state.suggestedAction && !state.session && !state.rootTask && !state.candidatePicker) {
                (0, cliShellConfig_1.clearSuggestedAction)(state);
            }
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
    }
    finally {
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
const renderShellHelp = () => {
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
        "  update prompt      If a newer release exists, Enter updates and Esc skips",
        "  !xacro            Install or verify the local XACRO runtime",
        "  /                  Open direct actions under the prompt",
        "  up/down            Move through picker options",
        "  tab                Complete the selected option or path",
        "  enter              Select the highlighted option, run the ready action, or accept a recommended fix",
        "  ctrl+c             Exit immediately",
        "  esc                Close the picker, cancel a pending value, or skip the recommended fix",
        "  /open              Load a repo, folder, or file as the current source",
        "  /inspect           Preview a repo or folder and suggest an entrypoint",
        "  /analyze           Run the compact investigation view",
        "  /health            Run the main health check",
        "  /validate          Validate URDF structure and required tags",
        "  /orientation       Guess the likely up-axis and forward axis",
        "  /update            Install the latest ilu release",
        "  /doctor            Show runtime, auth, and xacro diagnostics",
        "  /show              Show the current source and next step",
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

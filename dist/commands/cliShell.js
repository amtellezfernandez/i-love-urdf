"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInteractiveShell = exports.renderShellHelp = void 0;
const node_child_process_1 = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const process = require("node:process");
const archiveExtraction_1 = require("./archiveExtraction");
const commandCatalog_1 = require("./commandCatalog");
const cliCompletion_1 = require("./cliCompletion");
const cliShellConfig_1 = require("./cliShellConfig");
const cliShellRecommendations_1 = require("./cliShellRecommendations");
const cliShellUi_1 = require("./cliShellUi");
const shellPathInput_1 = require("./shellPathInput");
const cliUpdate_1 = require("./cliUpdate");
const sharedSession_1 = require("../session/sharedSession");
const githubCliAuth_1 = require("../node/githubCliAuth");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const repoBatchGuidance_1 = require("../gallery/repoBatchGuidance");
const localMeshReferenceInspection_1 = require("./localMeshReferenceInspection");
const studioRuntime_1 = require("../studio/studioRuntime");
const clearInteractiveFlowState = (state) => {
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    clearRepoIntentPrompt(state);
    clearRepoSourceContext(state);
    state.visualizerPromptResolved = false;
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.session = null;
    state.rootTask = null;
};
const clearExitPrompt = (state) => {
    state.exitPrompt = null;
};
const clearSavePrompt = (state) => {
    state.savePrompt = null;
};
const getCurrentWorkingUrdfPath = (state) => {
    const candidate = state.loadedSource?.urdfPath || state.lastUrdfPath;
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
        return null;
    }
    return candidate.trim();
};
const hashUrdfContent = (content) => crypto.createHash("sha256").update(content).digest("hex");
const readUrdfFileHash = (urdfPath) => {
    if (!urdfPath || !fs.existsSync(urdfPath) || !fs.statSync(urdfPath).isFile()) {
        return null;
    }
    return hashUrdfContent(fs.readFileSync(urdfPath, "utf8"));
};
const getCurrentSharedSessionUpdatedAt = (state) => state.sharedSessionId ? (0, sharedSession_1.readIluSharedSession)(state.sharedSessionId)?.updatedAt : undefined;
const syncSaveBaselineFromSnapshot = (state, snapshot) => {
    if (!snapshot) {
        state.saveBaselineHash = undefined;
        state.saveBaselineUpdatedAt = undefined;
        return;
    }
    state.saveBaselineHash = readUrdfFileHash(snapshot.workingUrdfPath) ?? undefined;
    state.saveBaselineUpdatedAt = snapshot.updatedAt;
};
const seedSaveBaselineFromCurrentSharedSessionIfUnset = (state) => {
    if (state.saveBaselineHash || state.saveBaselineUpdatedAt || !state.sharedSessionId) {
        return;
    }
    syncSaveBaselineFromSnapshot(state, (0, sharedSession_1.readIluSharedSession)(state.sharedSessionId));
};
const hasUnsavedWorkingCopyChanges = (state) => {
    if (!state.sharedSessionId) {
        return false;
    }
    const currentHash = readUrdfFileHash(getCurrentWorkingUrdfPath(state));
    if (currentHash && state.saveBaselineHash) {
        return currentHash !== state.saveBaselineHash;
    }
    const currentUpdatedAt = getCurrentSharedSessionUpdatedAt(state);
    if (currentUpdatedAt && state.saveBaselineUpdatedAt) {
        return currentUpdatedAt !== state.saveBaselineUpdatedAt;
    }
    if (currentHash && !state.saveBaselineHash) {
        return true;
    }
    return false;
};
const normalizeSaveFileName = (value) => {
    const fileName = sanitizeUrdfSnapshotName(value || "robot.urdf");
    return fileName.replace(/\.urdf$/i, "").concat(".urdf");
};
const toUrdfDestinationPath = (value) => value.replace(/\.(urdf\.xacro|xacro|zip)$/i, ".urdf");
const getDefaultSaveDirectory = () => {
    const downloadsDir = path.join(os.homedir(), "Downloads");
    if (fs.existsSync(downloadsDir)) {
        try {
            if (fs.statSync(downloadsDir).isDirectory()) {
                return downloadsDir;
            }
        }
        catch {
            // Ignore stat failures and fall back to cwd.
        }
    }
    return process.cwd();
};
const isLikelyEphemeralSourcePath = (value) => {
    const resolved = path.resolve(value);
    const sessionRoot = path.join(os.homedir(), ".i-love-urdf", "sessions");
    if (resolved === sessionRoot || resolved.startsWith(`${sessionRoot}${path.sep}`)) {
        return true;
    }
    const tmpRoot = path.resolve(os.tmpdir());
    if (!(resolved === tmpRoot || resolved.startsWith(`${tmpRoot}${path.sep}`))) {
        return false;
    }
    return (resolved.includes(`${path.sep}ilu-archive-`) ||
        resolved.includes(`${path.sep}ilu-loaded-`) ||
        path.basename(resolved).startsWith("ilu-"));
};
const getSaveFileNameHint = (state) => {
    const loadedSource = state.loadedSource;
    if (loadedSource?.repositoryUrdfPath) {
        return normalizeSaveFileName(loadedSource.repositoryUrdfPath);
    }
    if (loadedSource?.localPath && !isLikelyEphemeralSourcePath(loadedSource.localPath)) {
        return normalizeSaveFileName(loadedSource.localPath);
    }
    if (loadedSource?.githubRef) {
        const repoParts = loadedSource.githubRef.split("/").filter(Boolean);
        const repoName = repoParts[repoParts.length - 1] || "robot";
        return normalizeSaveFileName(repoName);
    }
    return normalizeSaveFileName(getCurrentWorkingUrdfPath(state) || "robot.urdf");
};
const getDefaultSavePath = (state) => {
    const loadedSource = state.loadedSource;
    if (loadedSource?.source === "local-file" && loadedSource.localPath && !isLikelyEphemeralSourcePath(loadedSource.localPath)) {
        return path.resolve(toUrdfDestinationPath(loadedSource.localPath));
    }
    if (loadedSource?.source === "local-repo" && loadedSource.localPath && !isLikelyEphemeralSourcePath(loadedSource.localPath)) {
        if (loadedSource.repositoryUrdfPath) {
            return path.resolve(toUrdfDestinationPath(path.join(loadedSource.localPath, loadedSource.repositoryUrdfPath)));
        }
        return path.resolve(path.join(loadedSource.localPath, getSaveFileNameHint(state)));
    }
    return path.resolve(path.join(getDefaultSaveDirectory(), getSaveFileNameHint(state)));
};
const resolveSaveDestinationPath = (rawInput, defaultPath) => {
    const trimmed = rawInput.trim();
    const normalizedInput = trimmed.length > 0
        ? (0, shellPathInput_1.normalizeFilesystemInput)(trimmed) || (0, shellPathInput_1.expandHomePath)(trimmed) || trimmed
        : defaultPath;
    let resolved = path.resolve(toUrdfDestinationPath(normalizedInput));
    if (fs.existsSync(resolved)) {
        try {
            if (fs.statSync(resolved).isDirectory()) {
                resolved = path.join(resolved, path.basename(defaultPath));
            }
        }
        catch {
            // Ignore stat failures and keep the resolved path as-is.
        }
    }
    else if (/[\\/]$/.test(normalizedInput)) {
        resolved = path.join(resolved, path.basename(defaultPath));
    }
    return resolved;
};
const saveWorkingUrdfToDestination = (state, destinationPath) => {
    const workingUrdfPath = getCurrentWorkingUrdfPath(state);
    if (!workingUrdfPath || !fs.existsSync(workingUrdfPath)) {
        throw new Error("working URDF is missing. load a robot before saving");
    }
    const urdfContent = fs.readFileSync(workingUrdfPath, "utf8");
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, urdfContent, "utf8");
    return {
        destinationPath,
        savedHash: hashUrdfContent(urdfContent),
    };
};
const beginSavePrompt = (state, options) => {
    state.savePrompt = {
        phase: "confirm",
        defaultPath: getDefaultSavePath(state),
        closeAfterSave: options.closeAfterSave,
    };
    return true;
};
const beginSaveExitPrompt = (state) => {
    if (!hasUnsavedWorkingCopyChanges(state)) {
        return false;
    }
    return beginSavePrompt(state, { closeAfterSave: true });
};
const getActiveSavePrompt = (state) => state.savePrompt;
const shouldPromptOnShellExit = (state) => state.visualizerOpened;
const beginVisualizerExitPrompt = (state) => {
    if (!shouldPromptOnShellExit(state)) {
        return false;
    }
    state.exitPrompt = {
        canStopVisualizer: (0, studioRuntime_1.isManagedStudioRunning)(),
        sessionId: state.sharedSessionId?.trim() || null,
    };
    return true;
};
const getVisualizerExitPrompt = (state) => state.exitPrompt;
const getSaveExitPromptText = () => "save the working URDF before exit?";
const getSavePathPromptText = (savePrompt) => `save path  Enter uses ${(0, cliShellConfig_1.quoteForPreview)(savePrompt.defaultPath)}`;
const getVisualizerExitPromptText = (exitPrompt) => exitPrompt.canStopVisualizer
    ? exitPrompt.sessionId
        ? `leave ilu and stop URDF Studio for session ${exitPrompt.sessionId}?`
        : "leave ilu and stop URDF Studio?"
    : exitPrompt.sessionId
        ? `leave ilu and disconnect from URDF Studio on session ${exitPrompt.sessionId}?`
        : "leave ilu and disconnect from URDF Studio?";
const getActiveTtyChoicePrompt = (state) => {
    const activeSavePrompt = getActiveSavePrompt(state);
    if (activeSavePrompt?.phase === "confirm") {
        return {
            kind: "save",
            prompt: activeSavePrompt,
            text: getSaveExitPromptText(),
            options: ["Save changes", "Exit without saving"],
        };
    }
    const activeExitPrompt = getVisualizerExitPrompt(state);
    if (activeExitPrompt) {
        return {
            kind: "exit",
            prompt: activeExitPrompt,
            text: getVisualizerExitPromptText(activeExitPrompt),
            options: activeExitPrompt.canStopVisualizer
                ? ["Quit Studio and exit", "Keep Studio open"]
                : ["Exit shell", "Stay here"],
        };
    }
    const activeSuggestedAction = getActiveSuggestedAction(state);
    if (!activeSuggestedAction) {
        return null;
    }
    return {
        kind: "suggested",
        prompt: activeSuggestedAction,
        text: activeSuggestedAction.prompt,
        options: [activeSuggestedAction.acceptOptionLabel, activeSuggestedAction.skipOptionLabel],
    };
};
const getTtyChoicePromptSelectionKey = (prompt) => {
    if (!prompt) {
        return null;
    }
    if (prompt.kind === "save") {
        return `save:${prompt.prompt.phase}:${prompt.prompt.defaultPath}:${prompt.prompt.closeAfterSave ? "close" : "stay"}`;
    }
    if (prompt.kind === "exit") {
        return `exit:${prompt.prompt.canStopVisualizer ? "managed" : "external"}:${prompt.prompt.sessionId ?? ""}`;
    }
    return `suggested:${prompt.prompt.kind}:${prompt.prompt.prompt}:${prompt.prompt.acceptOptionLabel}:${prompt.prompt.skipOptionLabel}`;
};
const renderTtyChoicePromptLine = (label, optionIndex, selectedIndex) => {
    const selected = optionIndex === selectedIndex;
    const prefix = selected ? "> " : "  ";
    const text = `${prefix}${optionIndex + 1}. ${label}`;
    return selected ? cliShellConfig_1.SHELL_THEME.selected(text) : cliShellConfig_1.SHELL_THEME.command(text);
};
const renderTtyChoicePromptHintLine = (prompt) => [
    `${cliShellConfig_1.SHELL_THEME.command("[↑↓]")} ${cliShellConfig_1.SHELL_THEME.muted("move")}`,
    `${cliShellConfig_1.SHELL_THEME.command("[Enter]")} ${cliShellConfig_1.SHELL_THEME.muted("confirm")}`,
    `${cliShellConfig_1.SHELL_THEME.command("[Esc]")} ${cliShellConfig_1.SHELL_THEME.muted(prompt.options[1])}`,
    `${cliShellConfig_1.SHELL_THEME.command("[1/2]")} ${cliShellConfig_1.SHELL_THEME.muted("quick select")}`,
].join("  ");
const getVisualizerExitDecisionHint = (exitPrompt, mode = "tty") => exitPrompt.canStopVisualizer
    ? mode === "tty"
        ? "Up/down choose. Enter confirms. 1 quits Studio and exits. 2 keeps Studio open."
        : "Press Enter to stop URDF Studio and exit. Type n to keep Studio open."
    : mode === "tty"
        ? "Up/down choose. Enter confirms. 1 exits the shell. 2 stays here."
        : "Press Enter to exit ilu. Type n to stay in the shell.";
const getSaveDecisionHint = (mode = "tty") => mode === "tty"
    ? "Up/down choose. Enter confirms. 1 saves the working URDF. 2 exits without saving."
    : "Press Enter to choose a save path, or type n to exit without saving.";
const getVisualizerDisconnectNotice = (state) => ({
    kind: "info",
    text: state.sharedSessionId
        ? `ilu terminal disconnected. URDF Studio kept session ${state.sharedSessionId}`
        : "ilu terminal disconnected. URDF Studio kept running",
});
const createVisualizerExitGuard = (state) => {
    let preserveVisualizerOnExit = false;
    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) {
            return;
        }
        cleanedUp = true;
        if (!preserveVisualizerOnExit && state.visualizerOpened) {
            (0, studioRuntime_1.stopManagedStudioImmediately)();
            state.visualizerOpened = false;
        }
    };
    const handleTerminationSignal = () => {
        cleanup();
        process.exit(0);
    };
    process.on("exit", cleanup);
    process.on("SIGHUP", handleTerminationSignal);
    process.on("SIGTERM", handleTerminationSignal);
    return {
        keepVisualizerOpenOnExit: () => {
            preserveVisualizerOnExit = true;
        },
        dispose: () => {
            process.off("exit", cleanup);
            process.off("SIGHUP", handleTerminationSignal);
            process.off("SIGTERM", handleTerminationSignal);
        },
    };
};
const runStopVisualizerAction = async (state) => {
    const stopResult = await (0, studioRuntime_1.stopManagedStudio)();
    if (stopResult.ok) {
        state.visualizerOpened = false;
        clearExitPrompt(state);
        const lines = ["stopped URDF Studio"];
        if (state.sharedSessionId) {
            lines.push(`session ${state.sharedSessionId} kept on disk`);
        }
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("visualizer", lines.join("\n"), "success"),
            notice: { kind: "success", text: "stopped URDF Studio" },
            clearSession: false,
        };
    }
    if (stopResult.ok === false) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("visualizer", stopResult.reason, "info"),
            notice: { kind: "info", text: stopResult.reason },
            clearSession: false,
        };
    }
    return {
        panel: (0, cliShellUi_1.createOutputPanel)("visualizer", "URDF Studio stop state is unavailable", "info"),
        notice: { kind: "info", text: "URDF Studio stop state is unavailable" },
        clearSession: false,
    };
};
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
        if (state.repoSourceContext) {
            return [
                { label: "source", value: state.repoSourceContext.sourceLabel },
                { label: "found", value: formatCount(state.repoSourceContext.payload.candidateCount, "robot") },
                {
                    label: "next",
                    value: "/work-one /gallery /repo-fixes or paste another source",
                    tone: "accent",
                },
            ];
        }
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
                    value: "paste repo or local path",
                    tone: "accent",
                },
            ];
        }
        return [
            { label: "source", value: `remembered ${(0, cliShellConfig_1.quoteForPreview)(state.lastUrdfPath)}` },
            {
                label: "next",
                value: "/align /analyze /health /validate /orientation",
                tone: "accent",
            },
        ];
    }
    const rows = [];
    const formatEntryPathForDisplay = (entryPath) => {
        const normalized = entryPath.replace(/\\/g, "/");
        if (normalized.length <= 40) {
            return normalized;
        }
        const segments = normalized.split("/").filter((segment) => segment.length > 0);
        if (segments.length <= 2) {
            return normalized;
        }
        return `.../${segments.slice(-2).join("/")}`;
    };
    if (state.sharedSessionId) {
        rows.push({
            label: "session",
            value: state.sharedSessionId,
            tone: "muted",
        });
    }
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
        rows.push({ label: "entry", value: formatEntryPathForDisplay(loadedSource.repositoryUrdfPath) });
    }
    if (loadedSource.urdfPath &&
        (loadedSource.source !== "local-file" || loadedSource.localPath !== loadedSource.urdfPath)) {
        rows.push({ label: "working urdf", value: (0, cliShellConfig_1.quoteForPreview)(loadedSource.urdfPath) });
    }
    rows.push({
        label: "next",
        value: loadedSource.source === "github" || loadedSource.source === "local-repo"
            ? "/align /analyze /health /validate /orientation /gallery /repo-fixes"
            : "/align /analyze /health /validate /orientation /gallery",
        tone: "accent",
    });
    return rows;
};
const printRootOptions = (state) => {
    (0, cliShellUi_1.printSectionTitle)("context");
    (0, cliShellUi_1.printContextRows)(getLoadedSourceContextRows(state));
    (0, cliShellUi_1.printSectionTitle)("actions");
    (0, cliShellUi_1.printCommandList)(getReadySourceLabel(state) ? getLoadedRootCommandList(state) : START_ROOT_MENU_ENTRIES);
    (0, cliShellUi_1.printSectionTitle)("system");
    (0, cliShellUi_1.printCommandList)(cliShellConfig_1.SHELL_BUILTIN_COMMANDS);
};
const printRootTaskOptions = (_task) => {
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("Direct actions only. Type / for actions or paste a source.\n")}`);
    printRootOptions({
        lastUrdfPath: undefined,
        loadedSource: null,
        sharedSessionId: undefined,
        repoIntentPrompt: null,
        repoSourceContext: null,
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
    if (session.command === "urdf-to-mjcf") {
        return "Export the current URDF as MJCF.";
    }
    if (session.command === "urdf-to-usd") {
        return "Export the current URDF as USD.";
    }
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
            return "Check the current orientation and offer a safe fix.";
        default:
            return getShellCommandSummary(session.command);
    }
};
const getSessionNextText = (session) => {
    if (session.pending) {
        return `paste ${session.pending.title.toLowerCase()}`;
    }
    if (session.label === "open" && session.args.size === 0) {
        return "paste repo or local path";
    }
    if (session.label === "inspect" && session.args.size === 0) {
        return "paste repo or local folder";
    }
    const requirementStatus = getRequirementStatus(session);
    if (requirementStatus.ready) {
        if (session.command === "urdf-to-mjcf" || session.command === "urdf-to-usd") {
            const outPath = session.args.get("out");
            return typeof outPath === "string" && outPath.trim().length > 0
                ? `press Enter to export to ${(0, cliShellConfig_1.quoteForPreview)(outPath)} or type /out`
                : "press Enter to export or type /out";
        }
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
    if (session.command === "urdf-to-mjcf" || session.command === "urdf-to-usd") {
        const outPath = session.args.get("out");
        if (typeof outPath === "string" && outPath.trim().length > 0) {
            rows.push({ label: "output", value: (0, cliShellConfig_1.quoteForPreview)(outPath) });
        }
    }
    if (session.pending ||
        ((session.label === "open" || session.label === "inspect") && session.args.size === 0) ||
        !getRequirementStatus(session).ready) {
        rows.push({
            label: "action",
            value: getSessionPurposeText(session).replace(/\.$/, ""),
            tone: "muted",
        });
    }
    rows.push({
        label: "next",
        value: getSessionNextText(session),
        tone: getRequirementStatus(session).ready ? "accent" : "command",
    });
    return rows;
};
const getPersistentTtyContextRows = (rows, hasHistory) => {
    if (!hasHistory) {
        return rows;
    }
    const importantLabels = new Set(["source", "entry", "selected", "output", "working urdf", "next"]);
    const compactRows = rows.filter((row) => importantLabels.has(row.label));
    return compactRows.length > 0 ? compactRows : rows;
};
const buildSessionNarrativeLines = (state, session) => getSessionContextRows(state, session)
    .filter((row) => row.label === "source" || row.label === "action" || row.label === "next")
    .map((row) => `${row.label} ${row.value}`);
const buildSessionHeadline = (session) => {
    if (session.command === "urdf-to-mjcf") {
        const source = getSessionSourceValue(session, ["urdf"]);
        return source ? `export MJCF from ${(0, cliShellConfig_1.quoteForPreview)(source)}` : "export MJCF";
    }
    if (session.command === "urdf-to-usd") {
        const source = getSessionSourceValue(session, ["urdf", "path"]);
        return source ? `export USD from ${(0, cliShellConfig_1.quoteForPreview)(source)}` : "export USD";
    }
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
const findUniqueRootTaskAction = (slashCommand) => {
    const matches = [];
    for (const task of cliShellConfig_1.ROOT_TASKS.map((entry) => entry.name)) {
        const action = findRootTaskAction(task, slashCommand);
        if (action) {
            matches.push({ task, action });
        }
    }
    return matches.length === 1 ? matches[0] ?? null : null;
};
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
        if (session.command === "urdf-to-mjcf") {
            return "Write the exported MJCF file here.";
        }
        if (session.command === "urdf-to-usd") {
            return "Write the exported USD file here.";
        }
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
const getExportFileSuffix = (command) => {
    if (command === "urdf-to-mjcf") {
        return ".mjcf.xml";
    }
    if (command === "urdf-to-usd") {
        return ".usda";
    }
    return null;
};
const getExportFileStem = (value) => {
    const normalized = value.replace(/\\/g, "/");
    const baseName = normalized.slice(normalized.lastIndexOf("/") + 1);
    if (/\.urdf\.xacro$/i.test(baseName)) {
        return baseName.replace(/\.urdf\.xacro$/i, "");
    }
    if (/\.urdf$/i.test(baseName)) {
        return baseName.replace(/\.urdf$/i, "");
    }
    if (/\.xacro$/i.test(baseName)) {
        return baseName.replace(/\.xacro$/i, "");
    }
    if (path.extname(baseName)) {
        return baseName.slice(0, -path.extname(baseName).length);
    }
    return baseName || "robot";
};
const buildDefaultExportFilename = (command, sourceName) => {
    const suffix = getExportFileSuffix(command);
    return `${getExportFileStem(sourceName) || "robot"}${suffix || ""}`;
};
const deriveSuggestedExportOutPath = (state, session) => {
    const suffix = getExportFileSuffix(session.command);
    if (!suffix) {
        return null;
    }
    const source = state.loadedSource;
    if (source?.source === "local-repo" && source.localPath && source.repositoryUrdfPath) {
        return path.join(source.localPath, path.dirname(source.repositoryUrdfPath), buildDefaultExportFilename(session.command, source.repositoryUrdfPath));
    }
    if (source?.source === "github" && source.repositoryUrdfPath) {
        return path.resolve(process.cwd(), buildDefaultExportFilename(session.command, source.repositoryUrdfPath));
    }
    if (source?.source === "local-file" && source.localPath) {
        const localPath = source.localPath;
        if (localPath.toLowerCase().endsWith(".zip")) {
            return path.resolve(process.cwd(), buildDefaultExportFilename(session.command, localPath));
        }
        return path.join(path.dirname(localPath), buildDefaultExportFilename(session.command, localPath));
    }
    const directUrdfPath = session.args.get("urdf");
    if (typeof directUrdfPath === "string" && directUrdfPath.trim().length > 0) {
        return path.join(path.dirname(directUrdfPath), buildDefaultExportFilename(session.command, directUrdfPath));
    }
    const sourcePath = session.args.get("path");
    if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
        const localPath = detectLocalPathDrop(sourcePath);
        if (localPath?.isDirectory) {
            const entryPath = session.args.get("entry");
            const sourceName = typeof entryPath === "string" && entryPath.trim().length > 0 ? entryPath : path.basename(sourcePath);
            return path.join(path.resolve(sourcePath), path.dirname(String(sourceName)), buildDefaultExportFilename(session.command, String(sourceName)));
        }
        return path.join(path.dirname(path.resolve(sourcePath)), buildDefaultExportFilename(session.command, sourcePath));
    }
    const lastUrdfPath = state.lastUrdfPath;
    if (lastUrdfPath) {
        return path.join(path.dirname(lastUrdfPath), buildDefaultExportFilename(session.command, lastUrdfPath));
    }
    return null;
};
const syncSuggestedExportOutPath = (state, session, feedback) => {
    const suggestedOutPath = deriveSuggestedExportOutPath(state, session);
    if (!suggestedOutPath) {
        return;
    }
    const currentOutPath = session.args.get("out");
    if (typeof currentOutPath === "string" && currentOutPath.trim().length > 0 && !session.inheritedKeys.has("out")) {
        return;
    }
    if (currentOutPath === suggestedOutPath) {
        session.inheritedKeys.add("out");
        return;
    }
    session.args.set("out", suggestedOutPath);
    session.inheritedKeys.add("out");
    (0, cliShellConfig_1.pushFeedback)(feedback, "info", `export target ${(0, cliShellConfig_1.quoteForPreview)(suggestedOutPath)}`);
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
const getPendingValuePrompt = (state, session, key, slashName) => {
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
        const suggestedOutPath = deriveSuggestedExportOutPath(state, session);
        return {
            key,
            slashName,
            title: "Output file path",
            examples: suggestedOutPath ? [suggestedOutPath] : ["./robot.fixed.urdf"],
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
const setSessionValue = (state, session, key, rawValue, feedback) => {
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
    syncSuggestedExportOutPath(state, session, feedback);
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
const getReadySourceLabel = (state) => state.loadedSource?.githubRef ||
    state.loadedSource?.localPath ||
    state.loadedSource?.urdfPath ||
    state.repoSourceContext?.sourceLabel ||
    state.lastUrdfPath ||
    null;
const rememberDirectUrdfSource = (state, urdfPath) => {
    clearRepoSourceContext(state);
    state.visualizerPromptResolved = false;
    state.loadedSource = {
        source: "local-file",
        urdfPath,
        localPath: urdfPath,
    };
};
const rememberLoadedSource = (state, payload, options = {}) => {
    clearRepoSourceContext(state);
    state.visualizerPromptResolved = false;
    const normalizedGitHubRef = typeof options.githubRef === "string" && options.githubRef.trim().length > 0
        ? options.githubRef.trim()
        : payload.repositoryUrl;
    if (payload.source === "github") {
        state.loadedSource = {
            source: "github",
            urdfPath: payload.outPath || state.lastUrdfPath || "",
            githubRef: normalizedGitHubRef,
            githubRevision: typeof options.githubRevision === "string" && options.githubRevision.trim().length > 0
                ? options.githubRevision.trim()
                : undefined,
            repositoryUrdfPath: payload.entryPath,
            meshReferenceCorrectionCount: payload.meshReferenceCorrectionCount,
            meshReferenceUnresolvedCount: payload.meshReferenceUnresolvedCount,
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
            meshReferenceCorrectionCount: payload.meshReferenceCorrectionCount,
            meshReferenceUnresolvedCount: payload.meshReferenceUnresolvedCount,
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
        if (session.command !== "load-source" &&
            (!state.loadedSource || state.loadedSource.urdfPath !== directUrdfPath)) {
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
        return `[next] /align /analyze /health /validate /orientation\nusing ${state.lastUrdfPath}`;
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
    const runtimePackages = Object.entries(payload.packageVersions ?? {});
    if (runtimePackages.length > 0) {
        lines.push(`packages ${runtimePackages.map(([name, version]) => `${name}=${version}`).join(", ")}`);
    }
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
    lines.push(`found ${formatCount(payload.candidateCount, "robot entrypoint")}`);
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
            : "choose what to do with this repo below"
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
        lines.push(`orientation likely ${formatOrientationGuessSummary(payload.orientationGuess)}`);
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
function formatOrientationGuessSummary(payload) {
    const up = payload.likelyUpDirection || payload.likelyUpAxis;
    const forward = payload.likelyForwardDirection || payload.likelyForwardAxis;
    return `${up}-up / ${forward}-forward`;
}
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
        lines.push(`orientation likely ${formatOrientationGuessSummary(orientation)}${confidence}`);
    }
    if (analysis.rootLinks.length > 0) {
        lines.push(analysis.rootLinks.length === 1
            ? `root ${analysis.rootLinks[0]}`
            : `${formatCount(analysis.rootLinks.length, "root link")}`);
    }
    const attentionLines = [];
    const hasOrientationSuggestion = getAlignOrientationSuggestedAction(suggestedAction) !== null;
    const needsAttention = !validation.isValid ||
        health.summary.errors > 0 ||
        health.summary.warnings > 0 ||
        analysis.meshReferences.length > 0 ||
        hasOrientationSuggestion;
    attentionLines.push(...(0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, 2));
    const orientationConflict = orientation.report?.conflicts?.[0];
    if (needsAttention && orientationConflict) {
        attentionLines.push(`note ${orientationConflict}`);
    }
    if (attentionLines.length === 0 && !hasOrientationSuggestion) {
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
const summarizeOrientationResult = (payload, urdfPath, suggestedAction = null) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    if (!payload.isValid || !payload.likelyUpAxis || !payload.likelyForwardAxis) {
        lines.push("could not infer orientation confidently");
        return {
            title: "orientation",
            kind: "info",
            lines,
        };
    }
    lines.push(`orientation likely ${formatOrientationGuessSummary(payload)}`);
    if (typeof payload.confidence === "number" && Number.isFinite(payload.confidence)) {
        lines.push(`confidence ${Math.round(payload.confidence * 100)}%`);
    }
    const matchesTarget = typeof payload.targetUpAxis === "string" &&
        typeof payload.targetForwardAxis === "string" &&
        payload.likelyUpDirection === `+${payload.targetUpAxis}` &&
        payload.likelyForwardDirection === `+${payload.targetForwardAxis}`;
    if (matchesTarget) {
        lines.push(`matches ${payload.targetUpAxis}-up / ${payload.targetForwardAxis}-forward`);
    }
    const topSignal = payload.signals?.find((signal) => typeof signal.message === "string" && signal.message.trim().length > 0);
    if (topSignal?.message) {
        lines.push(topSignal.message.trim());
    }
    const topConflict = payload.report?.conflicts?.[0];
    if (topConflict) {
        lines.push(`note ${topConflict}`);
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, suggestedAction, matchesTarget ? "next /analyze or paste another source" : "use /align to apply the recommended orientation fix");
    return {
        title: "orientation",
        kind: (payload.confidence ?? 0) >= 0.8 && !suggestedAction && matchesTarget ? "success" : "info",
        lines,
    };
};
const summarizeMjcfExportResult = (urdfPath, payload) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    if (payload.outPath) {
        lines.push(`exported MJCF to ${(0, cliShellConfig_1.quoteForPreview)(payload.outPath)}`);
    }
    else {
        lines.push("MJCF export ready");
        lines.push("set /out if you want to write the file");
    }
    lines.push(`${formatCount(payload.stats.bodiesCreated, "body")}  ${formatCount(payload.stats.jointsConverted, "joint")}  ${formatCount(payload.stats.geometriesConverted, "geometry")}`);
    for (const warning of payload.warnings.slice(0, 2)) {
        lines.push(warning);
    }
    return {
        title: "convert",
        kind: payload.warnings.length > 0 ? "info" : "success",
        lines,
    };
};
const summarizeUsdExportResult = (session, payload) => {
    const lines = [];
    const directUrdfPath = session.args.get("urdf");
    const sourcePath = session.args.get("path");
    const sourceValue = typeof directUrdfPath === "string" && directUrdfPath.trim().length > 0
        ? directUrdfPath
        : typeof sourcePath === "string" && sourcePath.trim().length > 0
            ? sourcePath
            : null;
    if (sourceValue) {
        lines.push(`source ${(0, cliShellConfig_1.quoteForPreview)(sourceValue)}`);
    }
    if (payload.entryPath) {
        lines.push(`entry ${payload.entryPath}`);
    }
    if (payload.outputPath) {
        lines.push(`exported USD to ${(0, cliShellConfig_1.quoteForPreview)(payload.outputPath)}`);
    }
    else {
        lines.push("USD export ready");
        lines.push("set /out if you want to write the file");
    }
    lines.push(`${formatCount(payload.stats.linksConverted, "link")}  ${formatCount(payload.stats.jointsConverted, "joint")}  ${formatCount(payload.stats.visualsConverted, "visual")}  ${formatCount(payload.stats.collisionsConverted, "collision")}`);
    if (payload.stats.inlineMeshesConverted > 0) {
        lines.push(`${formatCount(payload.stats.inlineMeshesConverted, "mesh")} converted inline`);
    }
    if (payload.stats.unsupportedMeshes > 0) {
        lines.push(`${formatCount(payload.stats.unsupportedMeshes, "mesh")} still need attention`);
    }
    for (const warning of payload.warnings.slice(0, 2)) {
        lines.push(warning);
    }
    return {
        title: "convert",
        kind: payload.warnings.length > 0 || payload.stats.unsupportedMeshes > 0 ? "info" : "success",
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
const dismissResumePrompt = (state) => {
    state.resumePrompt = null;
};
const getResumePromptSourceLabel = (snapshot) => {
    const source = snapshot.loadedSource;
    if (!source) {
        return (0, cliShellConfig_1.quoteForPreview)(snapshot.workingUrdfPath);
    }
    if (source.source === "github") {
        return `GitHub ${(0, cliShellConfig_1.quoteForPreview)(source.githubRef ?? snapshot.workingUrdfPath)}`;
    }
    if (source.source === "local-repo") {
        return `folder ${(0, cliShellConfig_1.quoteForPreview)(source.localPath ?? snapshot.workingUrdfPath)}`;
    }
    return describeLocalSourceValue(source.localPath ?? snapshot.workingUrdfPath);
};
const formatResumePromptLine = (snapshot) => `resume ${snapshot.sessionId} from ${getResumePromptSourceLabel(snapshot)}  Enter resumes  Esc skips`;
const startStartupResumeCheck = (state, onAvailable) => {
    const snapshot = (0, sharedSession_1.readLatestIluSharedSession)();
    if (!snapshot || state.resumePrompt) {
        return;
    }
    state.resumePrompt = snapshot;
    onAvailable(snapshot);
};
const getActiveResumePrompt = (state) => !state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker ? state.resumePrompt : null;
const acceptResumePrompt = (state) => {
    const snapshot = state.resumePrompt;
    if (!snapshot) {
        throw new Error("No resumable ilu session is available.");
    }
    dismissResumePrompt(state);
    const attached = (0, sharedSession_1.attachShellToSharedSession)(state, snapshot.sessionId);
    syncSaveBaselineFromSnapshot(state, attached);
    return attached;
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
        lines.push(`orientation likely ${formatOrientationGuessSummary(health.orientationGuess)}`);
    }
    for (const line of (0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, 2)) {
        lines.push(line);
    }
    if ((options.unresolvedMeshRefs ?? 0) > 0) {
        lines.push("some mesh references still need attention");
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, options.suggestedAction ?? null, "next /analyze or paste another source");
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
const getActiveSuggestedAction = (state) => !state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker
    ? state.suggestedAction
    : null;
const getUnderlyingSuggestedAction = (suggestedAction) => suggestedAction?.kind === "open-visualizer" || suggestedAction?.kind === "install-visualizer"
    ? getUnderlyingSuggestedAction(suggestedAction.followUpAction ?? null)
    : suggestedAction ?? null;
const getAlignOrientationSuggestedAction = (suggestedAction) => {
    const underlyingSuggestedAction = getUnderlyingSuggestedAction(suggestedAction);
    return underlyingSuggestedAction?.kind === "align-orientation" ? underlyingSuggestedAction : null;
};
const prepareSuggestedAction = (state, suggestedAction) => {
    if (state.visualizerPromptResolved ||
        (!state.loadedSource?.urdfPath && !state.lastUrdfPath) ||
        suggestedAction?.kind === "open-visualizer" ||
        suggestedAction?.kind === "install-visualizer") {
        return suggestedAction;
    }
    return (0, cliShellRecommendations_1.buildOpenVisualizerSuggestion)(getUnderlyingSuggestedAction(suggestedAction));
};
const setPreparedSuggestedAction = (state, suggestedAction) => {
    state.suggestedAction = prepareSuggestedAction(state, suggestedAction);
};
const skipSuggestedAction = (state, suggestedAction) => {
    if (suggestedAction.kind === "open-visualizer" || suggestedAction.kind === "install-visualizer") {
        state.visualizerPromptResolved = true;
        state.suggestedAction = suggestedAction.followUpAction ?? null;
    }
    else {
        (0, cliShellConfig_1.clearSuggestedAction)(state);
    }
    return {
        kind: "info",
        text: getSuggestedActionSkipMessage(suggestedAction),
    };
};
const bypassSuggestedAction = (state, suggestedAction) => {
    if (suggestedAction.kind === "open-visualizer" || suggestedAction.kind === "install-visualizer") {
        state.visualizerPromptResolved = true;
        state.suggestedAction = suggestedAction.followUpAction ?? null;
    }
};
const getSuggestedActionDecisionHint = (suggestedAction, mode = "tty") => mode === "tty"
    ? `Up/down choose. Enter confirms. 1 ${suggestedAction.acceptOptionLabel.toLowerCase()}. 2 ${suggestedAction.skipOptionLabel.toLowerCase()}.`
    : `Press Enter to ${suggestedAction.acceptOptionLabel.toLowerCase()}. Type n to ${suggestedAction.skipOptionLabel.toLowerCase()}.`;
const getSuggestedActionSkipMessage = (suggestedAction) => suggestedAction.kind === "review-attention"
    ? "kept the current summary"
    : suggestedAction.kind === "align-orientation"
        ? "kept the current orientation"
        : suggestedAction.kind === "apply-repo-fixes"
            ? "kept the repo unchanged"
            : suggestedAction.kind === "open-visualizer" || suggestedAction.kind === "install-visualizer"
                ? "continuing in the shell"
                : "kept the current working copy";
const getFollowUpSuggestedAction = (state, options) => {
    const rawSuggestedAction = (0, cliShellRecommendations_1.detectSuggestedAction)(state, {
        selectedCandidate: options.selectedCandidate,
        urdfPath: options.urdfPath,
        orientationGuess: options.health.orientationGuess,
    }) ??
        ((0, cliShellRecommendations_1.hasAttentionIssues)({
            validation: options.validation,
            health: options.health,
        })
            ? (0, cliShellRecommendations_1.buildReviewAttentionSuggestion)()
            : null);
    return prepareSuggestedAction(state, rawSuggestedAction);
};
const renderSuggestedActionChoiceLine = (suggestedAction, mode) => mode === "tty"
    ? `${cliShellConfig_1.SHELL_THEME.command("[Enter]")} ${cliShellConfig_1.SHELL_THEME.muted(suggestedAction.acceptOptionLabel)}  ${cliShellConfig_1.SHELL_THEME.command("[Esc]")} ${cliShellConfig_1.SHELL_THEME.muted(suggestedAction.skipOptionLabel)}`
    : `${cliShellConfig_1.SHELL_THEME.command("[Enter]")} ${cliShellConfig_1.SHELL_THEME.muted(suggestedAction.acceptOptionLabel)}  ${cliShellConfig_1.SHELL_THEME.command("[n]")} ${cliShellConfig_1.SHELL_THEME.muted(suggestedAction.skipOptionLabel)}`;
const summarizeRemainingAttention = (state, urdfPath) => {
    const validationExecution = executeCliCommand("validate", new Map([["urdf", urdfPath]]));
    if (validationExecution.status !== 0) {
        const panel = buildPreviewErrorPanel("investigation", validationExecution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "could not review the remaining issues"),
            clearSession: false,
        };
    }
    const healthExecution = executeCliCommand("health-check", new Map([["urdf", urdfPath]]));
    if (healthExecution.status !== 0) {
        const panel = buildPreviewErrorPanel("investigation", healthExecution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "could not review the remaining issues"),
            clearSession: false,
        };
    }
    const orientationExecution = executeCliCommand("guess-orientation", new Map([["urdf", urdfPath]]));
    if (orientationExecution.status !== 0) {
        const panel = buildPreviewErrorPanel("investigation", orientationExecution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "could not review the remaining issues"),
            clearSession: false,
        };
    }
    const analysisExecution = executeCliCommand("analyze", new Map([["urdf", urdfPath]]));
    if (analysisExecution.status !== 0) {
        const panel = buildPreviewErrorPanel("investigation", analysisExecution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "could not review the remaining issues"),
            clearSession: false,
        };
    }
    const validationPayload = parseExecutionJson(validationExecution);
    const healthPayload = parseExecutionJson(healthExecution);
    const orientationPayload = parseExecutionJson(orientationExecution);
    const analysisPayload = parseExecutionJson(analysisExecution);
    if (!validationPayload || !healthPayload || !orientationPayload || !analysisPayload) {
        const panel = buildPreviewErrorPanel("investigation", analysisExecution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "could not review the remaining issues"),
            clearSession: false,
        };
    }
    setPreparedSuggestedAction(state, (0, cliShellRecommendations_1.detectSuggestedAction)(state, {
        urdfPath,
        orientationGuess: healthPayload.orientationGuess ?? orientationPayload,
    }));
    return {
        panel: summarizeInvestigateResult(urdfPath, validationPayload, healthPayload, analysisPayload, orientationPayload, state.suggestedAction),
        notice: { kind: "info", text: "remaining issues reviewed" },
        clearSession: false,
    };
};
const getSuggestedActionBusyState = (suggestedAction) => suggestedAction.kind === "repair-mesh-refs"
    ? {
        title: "repairing",
        lines: ["repairing mesh references...", "rerunning validation and health check..."],
    }
    : suggestedAction.kind === "fix-mesh-paths"
        ? {
            title: "repairing",
            lines: ["repairing mesh paths...", "rerunning validation and health check..."],
        }
        : suggestedAction.kind === "align-orientation"
            ? {
                title: "aligning",
                lines: ["aligning orientation...", "rerunning validation and health check..."],
            }
            : suggestedAction.kind === "apply-repo-fixes"
                ? {
                    title: "repo fixes",
                    lines: ["applying shared safe fixes across the repo...", "checking what still needs review..."],
                }
                : suggestedAction.kind === "install-visualizer"
                    ? {
                        title: "visualizer",
                        lines: ["installing URDF Studio...", "opening the visualizer when setup is ready..."],
                    }
                    : suggestedAction.kind === "open-visualizer"
                        ? {
                            title: "visualizer",
                            lines: ["opening URDF Studio...", "keeping the current fix ready in the shell..."],
                        }
                        : {
                            title: "reviewing",
                            lines: ["reviewing the remaining issues...", "summarizing what to fix next..."],
                        };
const runAlignOrientationAction = (state) => {
    const alignSuggestedAction = getAlignOrientationSuggestedAction(state.suggestedAction);
    if (alignSuggestedAction) {
        state.visualizerPromptResolved = true;
        state.suggestedAction = alignSuggestedAction;
        return runSuggestedAction(state);
    }
    const urdfPath = state.loadedSource?.urdfPath || state.lastUrdfPath;
    if (!urdfPath) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("orientation", "paste a repo or local path first"),
            notice: { kind: "info", text: "no loaded source yet" },
            clearSession: false,
        };
    }
    const previousSuggestedAction = state.suggestedAction;
    const orientationExecution = executeCliCommand("guess-orientation", new Map([["urdf", urdfPath]]));
    if (orientationExecution.status !== 0) {
        const panel = buildPreviewErrorPanel("orientation", orientationExecution);
        state.suggestedAction = previousSuggestedAction;
        return {
            panel,
            notice: buildShellFailureNotice(panel, "orientation review failed"),
            clearSession: false,
        };
    }
    const orientationPayload = parseExecutionJson(orientationExecution);
    if (!orientationPayload) {
        state.suggestedAction = previousSuggestedAction;
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("orientation", "could not read the orientation result", "error"),
            notice: { kind: "error", text: "orientation review failed" },
            clearSession: false,
        };
    }
    const suggestedAction = (0, cliShellRecommendations_1.detectSuggestedAction)(state, {
        urdfPath,
        orientationGuess: orientationPayload,
    });
    const nextAlignSuggestedAction = getAlignOrientationSuggestedAction(suggestedAction);
    if (!nextAlignSuggestedAction) {
        state.suggestedAction = getAlignOrientationSuggestedAction(previousSuggestedAction) ? null : previousSuggestedAction;
        const matchesTarget = typeof orientationPayload.targetUpAxis === "string" &&
            typeof orientationPayload.targetForwardAxis === "string" &&
            orientationPayload.likelyUpDirection === `+${orientationPayload.targetUpAxis}` &&
            orientationPayload.likelyForwardDirection === `+${orientationPayload.targetForwardAxis}`;
        return {
            panel: summarizeOrientationResult(orientationPayload, urdfPath, null),
            notice: {
                kind: matchesTarget ? "success" : "info",
                text: matchesTarget ? "orientation already matches the working target" : "orientation review complete",
            },
            clearSession: false,
        };
    }
    state.visualizerPromptResolved = true;
    state.suggestedAction = nextAlignSuggestedAction;
    return runSuggestedAction(state);
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
    if (suggestedAction.kind === "open-visualizer" || suggestedAction.kind === "install-visualizer") {
        state.visualizerPromptResolved = true;
        state.suggestedAction = suggestedAction.followUpAction ?? null;
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("visualizer", "open the visualizer through the async shell action", "error"),
            notice: { kind: "error", text: "visualizer action could not start" },
            clearSession: false,
        };
    }
    if (suggestedAction.kind === "apply-repo-fixes") {
        return runRepoBatchAction(state, "repo-fixes");
    }
    if (suggestedAction.kind === "review-attention") {
        const activeUrdfPath = state.loadedSource?.urdfPath || state.lastUrdfPath;
        if (!activeUrdfPath) {
            return {
                panel: (0, cliShellUi_1.createOutputPanel)("investigation", "could not find a loaded URDF", "error"),
                notice: { kind: "error", text: "review could not start" },
                clearSession: false,
            };
        }
        return summarizeRemainingAttention(state, activeUrdfPath);
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
        if (state.loadedSource) {
            state.loadedSource = {
                ...state.loadedSource,
                meshReferenceCorrectionCount: 0,
                meshReferenceUnresolvedCount: repairPayload.unresolved.length,
            };
        }
        const sharedSnapshot = (0, sharedSession_1.persistShellSharedSession)(state, {
            sourceUrdfPath: workingUrdfPath,
            fileNameHint: source.repositoryUrdfPath,
        });
        const sharedUrdfPath = sharedSnapshot?.workingUrdfPath || workingUrdfPath;
        const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(sharedUrdfPath);
        if (!validationPayload || !healthPayload) {
            const panel = buildPreviewErrorPanel("repair", !validationPayload ? validationExecution : healthExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "repair checks failed"),
                clearSession: false,
            };
        }
        state.suggestedAction = getFollowUpSuggestedAction(state, {
            urdfPath: sharedUrdfPath,
            validation: validationPayload,
            health: healthPayload,
        });
        return {
            panel: summarizeRepairResult("repaired mesh references", validationPayload, healthPayload, {
                unresolvedMeshRefs: repairPayload.unresolved.length,
                suggestedAction: state.suggestedAction,
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
    if (suggestedAction.kind === "align-orientation") {
        const urdfPath = state.loadedSource?.urdfPath || state.lastUrdfPath;
        const orientationPlan = suggestedAction.orientationPlan;
        if (!urdfPath || !orientationPlan) {
            return {
                panel: (0, cliShellUi_1.createOutputPanel)("repair", "could not find a loaded URDF", "error"),
                notice: { kind: "error", text: "orientation repair could not start" },
                clearSession: false,
            };
        }
        const workingUrdfPath = createTempUrdfSnapshotPath(urdfPath);
        const args = new Map([
            ["urdf", urdfPath],
            ["source-up", orientationPlan.sourceUpAxis],
            ["source-forward", orientationPlan.sourceForwardAxis],
            ["target-up", orientationPlan.targetUpAxis],
            ["target-forward", orientationPlan.targetForwardAxis],
            ["out", workingUrdfPath],
        ]);
        const orientationExecution = executeCliCommand("apply-orientation", args);
        if (orientationExecution.status !== 0) {
            const panel = buildPreviewErrorPanel("repair", orientationExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "orientation repair failed"),
                clearSession: false,
            };
        }
        applyWorkingUrdfSnapshot(state, workingUrdfPath);
        const sharedSnapshot = (0, sharedSession_1.persistShellSharedSession)(state, {
            sourceUrdfPath: workingUrdfPath,
            fileNameHint: path.basename(urdfPath),
        });
        const sharedUrdfPath = sharedSnapshot?.workingUrdfPath || workingUrdfPath;
        const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(sharedUrdfPath);
        if (!validationPayload || !healthPayload) {
            const panel = buildPreviewErrorPanel("repair", !validationPayload ? validationExecution : healthExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "repair checks failed"),
                clearSession: false,
            };
        }
        state.suggestedAction = getFollowUpSuggestedAction(state, {
            urdfPath: sharedUrdfPath,
            validation: validationPayload,
            health: healthPayload,
        });
        const orientationAlignedCleanly = validationPayload.isValid &&
            healthPayload.ok &&
            healthPayload.summary.errors === 0 &&
            healthPayload.summary.warnings === 0 &&
            !state.suggestedAction;
        if (orientationAlignedCleanly) {
            return {
                panel: null,
                notice: { kind: "success", text: "orientation aligned" },
                clearSession: false,
            };
        }
        return {
            panel: summarizeRepairResult("aligned orientation", validationPayload, healthPayload, {
                suggestedAction: state.suggestedAction,
            }),
            notice: {
                kind: validationPayload.isValid &&
                    healthPayload.ok &&
                    healthPayload.summary.errors === 0 &&
                    healthPayload.summary.warnings === 0 &&
                    !state.suggestedAction
                    ? "success"
                    : "info",
                text: validationPayload.isValid &&
                    healthPayload.ok &&
                    healthPayload.summary.errors === 0 &&
                    healthPayload.summary.warnings === 0 &&
                    !state.suggestedAction
                    ? "orientation aligned"
                    : "orientation aligned. review the remaining attention points",
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
        const fixed = (0, localMeshReferenceInspection_1.fixLocalMeshPaths)(urdfPath, fs.readFileSync(urdfPath, "utf8"));
        const workingUrdfPath = createTempUrdfSnapshotPath(urdfPath);
        fs.writeFileSync(workingUrdfPath, fixed.urdfContent, "utf8");
        applyWorkingUrdfSnapshot(state, workingUrdfPath);
        const sharedSnapshot = (0, sharedSession_1.persistShellSharedSession)(state, {
            urdfContent: fixed.urdfContent,
            sourceUrdfPath: workingUrdfPath,
            fileNameHint: path.basename(urdfPath),
        });
        const sharedUrdfPath = sharedSnapshot?.workingUrdfPath || workingUrdfPath;
        const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(sharedUrdfPath);
        if (!validationPayload || !healthPayload) {
            const panel = buildPreviewErrorPanel("repair", !validationPayload ? validationExecution : healthExecution);
            return {
                panel,
                notice: buildShellFailureNotice(panel, "repair checks failed"),
                clearSession: false,
            };
        }
        state.suggestedAction = getFollowUpSuggestedAction(state, {
            urdfPath: sharedUrdfPath,
            validation: validationPayload,
            health: healthPayload,
        });
        if (fixed.unresolved.length > 0 && state.suggestedAction?.kind === "fix-mesh-paths") {
            state.suggestedAction = (0, cliShellRecommendations_1.buildReviewAttentionSuggestion)();
        }
        return {
            panel: summarizeRepairResult("repaired mesh paths", validationPayload, healthPayload, {
                unresolvedMeshRefs: fixed.unresolved.length,
                suggestedAction: state.suggestedAction,
            }),
            notice: {
                kind: validationPayload.isValid &&
                    healthPayload.ok &&
                    healthPayload.summary.errors === 0 &&
                    healthPayload.summary.warnings === 0
                    ? "success"
                    : "info",
                text: fixed.unresolved.length > 0
                    ? fixed.corrections.length > 0
                        ? "mesh paths repaired. some references still need review"
                        : "mesh paths still need review"
                    : fixed.corrections.length > 0
                        ? "mesh paths repaired"
                        : "mesh paths already looked consistent",
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
const getVisualizerInstallSuggestion = (mode, followUpAction) => (0, cliShellRecommendations_1.buildInstallVisualizerSuggestion)(mode, followUpAction ?? null);
const runInstallVisualizerAction = async (state, suggestedAction) => {
    const installRoot = (0, studioRuntime_1.getPreferredStudioInstallRoot)();
    const installResult = (0, studioRuntime_1.installStudio)();
    if (installResult.ok === false) {
        state.visualizerPromptResolved = true;
        state.suggestedAction = suggestedAction.followUpAction ?? null;
        const lines = [
            installResult.reason,
            `studio repo ${(0, cliShellConfig_1.quoteForPreview)(installResult.studioRoot)}`,
            `clone ${(0, cliShellConfig_1.quoteForPreview)(`git clone --depth 1 https://github.com/urdf-studio/urdf-studio-unprod.git ${installRoot}`)}`,
            `setup ${(0, cliShellConfig_1.quoteForPreview)(`cd ${installResult.studioRoot} && npm run setup`)}`,
            ...installResult.outputLines,
        ];
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("visualizer", lines.join("\n"), "error"),
            notice: { kind: "error", text: "URDF Studio install failed" },
            clearSession: false,
        };
    }
    const openResult = await (0, sharedSession_1.openVisualizerForShellState)(state);
    seedSaveBaselineFromCurrentSharedSessionIfUnset(state);
    state.visualizerPromptResolved = true;
    state.suggestedAction = suggestedAction.followUpAction ?? null;
    const installLines = [
        installResult.cloned ? "installed URDF Studio" : "finished URDF Studio setup",
        `studio repo ${(0, cliShellConfig_1.quoteForPreview)(installResult.studioRoot)}`,
        ...installResult.outputLines,
    ];
    const panelLines = [...installLines, ...(openResult.panel?.lines ?? [])];
    return {
        panel: (0, cliShellUi_1.createOutputPanel)("visualizer", panelLines.join("\n"), openResult.panel?.kind ?? "success"),
        notice: openResult.notice?.kind === "warning" || openResult.notice?.kind === "error"
            ? openResult.notice
            : {
                kind: "success",
                text: openResult.notice?.text || "installed and opened URDF Studio for the current session",
            },
        clearSession: false,
        visualizerFailureCode: openResult.visualizerFailureCode,
    };
};
const runSuggestedActionAsync = async (state) => {
    const suggestedAction = state.suggestedAction;
    if (suggestedAction?.kind === "open-visualizer") {
        (0, cliShellConfig_1.clearSuggestedAction)(state);
        const result = await (0, sharedSession_1.openVisualizerForShellState)(state);
        seedSaveBaselineFromCurrentSharedSessionIfUnset(state);
        state.visualizerPromptResolved = true;
        state.suggestedAction =
            result.visualizerFailureCode === "missing-repo"
                ? getVisualizerInstallSuggestion("install", suggestedAction.followUpAction)
                : result.visualizerFailureCode === "needs-setup"
                    ? getVisualizerInstallSuggestion("setup", suggestedAction.followUpAction)
                    : suggestedAction.followUpAction ?? null;
        return result;
    }
    if (suggestedAction?.kind === "install-visualizer") {
        (0, cliShellConfig_1.clearSuggestedAction)(state);
        return runInstallVisualizerAction(state, suggestedAction);
    }
    return runSuggestedAction(state);
};
const resolveLoadableSourcePath = (sourcePath) => {
    const localPath = detectLocalPathDrop(sourcePath);
    if (!localPath?.isZipFile) {
        return { workingPath: sourcePath };
    }
    const extracted = (0, archiveExtraction_1.extractZipArchiveToTempRoot)(localPath.absolutePath, {
        tempDir: os.tmpdir(),
    });
    return {
        workingPath: extracted.workingPath,
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
            clearSession: panel?.title !== "xacro",
        };
    }
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.lastUrdfPath = loadPayload.outPath;
    rememberLoadedSource(state, loadPayload, {
        githubRef: typeof execArgs.get("github") === "string" ? String(execArgs.get("github")) : undefined,
        githubRevision: typeof execArgs.get("ref") === "string" ? String(execArgs.get("ref")) : undefined,
    });
    const sharedSnapshot = (0, sharedSession_1.persistShellSharedSession)(state, {
        sourceUrdfPath: loadPayload.outPath,
        fileNameHint: loadPayload.entryPath,
    });
    syncSaveBaselineFromSnapshot(state, sharedSnapshot);
    const { validationExecution, healthExecution, validationPayload, healthPayload } = runValidationAndHealthChecks(sharedSnapshot?.workingUrdfPath || loadPayload.outPath);
    if (!validationPayload || !healthPayload) {
        const panel = buildPreviewErrorPanel("error", !validationPayload ? validationExecution : healthExecution);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "validation failed to run"),
            clearSession: true,
        };
    }
    state.suggestedAction = getFollowUpSuggestedAction(state, {
        selectedCandidate: options.selectedCandidate,
        urdfPath: sharedSnapshot?.workingUrdfPath || loadPayload.outPath,
        validation: validationPayload,
        health: healthPayload,
    });
    const panel = summarizeAutoLoadChecks(loadPayload, validationPayload, healthPayload, {
        extractedArchivePath: options.extractedArchivePath,
        requestedEntryPath: options.requestedEntryPath,
        suggestedAction: state.suggestedAction,
    });
    return {
        panel,
        notice: null,
        clearSession: true,
    };
};
const runSelectedCandidatePicker = (state, picker, selectionPath) => {
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
    const underlyingSuggestedAction = getUnderlyingSuggestedAction(options.suggestedAction ?? null);
    const isMeshAction = underlyingSuggestedAction?.kind === "repair-mesh-refs" || underlyingSuggestedAction?.kind === "fix-mesh-paths";
    const attentionLines = (0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, isMeshAction ? 3 : 2);
    const meshAttentionLines = attentionLines.filter((line) => /mesh/i.test(line));
    if (isMeshAction) {
        if (meshAttentionLines.length > 0) {
            lines.push(...meshAttentionLines.slice(0, 2));
        }
        else if (underlyingSuggestedAction?.summary) {
            lines.push(underlyingSuggestedAction.summary);
        }
        for (const line of attentionLines.filter((entry) => !meshAttentionLines.includes(entry)).slice(0, 1)) {
            lines.push(line);
        }
    }
    else {
        lines.push((0, cliShellRecommendations_1.getValidationStatusLine)(validation));
        lines.push((0, cliShellRecommendations_1.getHealthStatusLine)(health));
        if (health.orientationGuess?.likelyUpAxis && health.orientationGuess?.likelyForwardAxis) {
            lines.push(`orientation likely ${formatOrientationGuessSummary(health.orientationGuess)}`);
        }
        for (const line of attentionLines) {
            lines.push(line);
        }
    }
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
const resolveRepoBatchSource = (state) => {
    const repoSourceContext = getRepoSourceContext(state);
    if (repoSourceContext) {
        const githubRef = repoSourceContext.loadArgs.get("github");
        if (typeof githubRef === "string" && githubRef.trim().length > 0) {
            return {
                kind: "github",
                githubRef,
                sourceLabel: repoSourceContext.sourceLabel,
            };
        }
        const localPath = repoSourceContext.loadArgs.get("path");
        if (typeof localPath === "string" && localPath.trim().length > 0) {
            return {
                kind: "local",
                localPath,
                sourceLabel: repoSourceContext.sourceLabel,
            };
        }
        return null;
    }
    const source = state.loadedSource;
    if (source?.source === "github" && source.githubRef) {
        return {
            kind: "github",
            githubRef: source.githubRef,
            sourceLabel: source.githubRef,
        };
    }
    if (source?.source === "local-repo" && source.localPath) {
        return {
            kind: "local",
            localPath: source.localPath,
            sourceLabel: source.localPath,
        };
    }
    return null;
};
const summarizeGalleryBatchPanel = (mode, result) => {
    const readyCount = result.generatedCount + result.generatedWithFixesCount;
    const reviewItems = result.items.filter((item) => item.status === "needs-review");
    const firstReviewItem = reviewItems[0];
    const lines = [`source ${result.sourceLabel}`];
    if (mode === "gallery") {
        lines.push(`generated ${readyCount} of ${formatCount(result.robotCount, "robot")}`);
        if (result.generatedWithFixesCount > 0) {
            lines.push(`${result.generatedWithFixesCount} generated with shared safe fixes`);
        }
        if (result.needsReviewCount > 0) {
            lines.push(`${result.needsReviewCount} still need review`);
        }
        if (result.skippedCount > 0) {
            lines.push(`${result.skippedCount} skipped`);
        }
        lines.push(`${result.thumbnailCount} thumbnails ready`);
        if (result.thumbnailSkippedCount > 0) {
            lines.push(`${result.thumbnailSkippedCount} thumbnails skipped`);
        }
    }
    else {
        if (result.sharedFixGroups.length > 0) {
            const appliedFixLabels = result.sharedFixGroups.map((group) => group.label).join(", ");
            lines.push(`applied shared safe fixes ${appliedFixLabels}`);
        }
        else {
            lines.push("no shared repo-wide fixes were needed");
        }
        if (readyCount > 0) {
            lines.push(`${readyCount} ready for gallery now`);
        }
        if (result.needsReviewCount > 0) {
            lines.push(`${result.needsReviewCount} still need review before the repo is fully ready`);
        }
        if (result.skippedCount > 0) {
            lines.push(`${result.skippedCount} skipped`);
        }
    }
    for (const group of result.sharedFixGroups.slice(0, 3)) {
        if (group.count > 1) {
            lines.push(`${group.count} robots shared: ${group.label}`);
        }
    }
    if (mode === "repo-fixes" && firstReviewItem) {
        lines.push(`review ${firstReviewItem.candidatePath}`);
        const firstAttention = firstReviewItem.attentionLines[0];
        if (typeof firstAttention === "string" && firstAttention.trim().length > 0) {
            lines.push(firstAttention);
        }
    }
    lines.push(`output ${(0, cliShellConfig_1.quoteForPreview)(result.outputRoot)}`);
    if (mode === "gallery") {
        lines.push("next review flagged robots or open the output diff");
    }
    else if (result.needsReviewCount === 0) {
        lines.push("next /gallery. the repo looks ready for gallery generation");
    }
    else if (readyCount > 0 && firstReviewItem) {
        lines.push(`next /gallery for the ready robots, or /work-one to review ${firstReviewItem.candidatePath}`);
    }
    else if (firstReviewItem) {
        lines.push(`next /work-one to review ${firstReviewItem.candidatePath} before /gallery`);
    }
    else {
        lines.push("next /work-one to review the flagged robots before /gallery");
    }
    return {
        title: mode === "gallery" ? "gallery" : "repo fixes",
        kind: result.needsReviewCount === 0 && result.skippedCount === 0 ? "success" : "info",
        lines,
    };
};
const previewRepoFixesAction = (state) => {
    const repoContext = getRepoSourceContext(state);
    if (!repoContext) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("repo fixes", "load a multi-robot repo first"),
            notice: { kind: "info", text: "no repo batch source yet" },
            clearSession: false,
        };
    }
    clearRepoIntentPrompt(state);
    setPreparedSuggestedAction(state, (0, repoBatchGuidance_1.buildApplyRepoFixesSuggestion)());
    return {
        panel: (0, repoBatchGuidance_1.summarizeRepoFixesPreviewPanel)(repoContext),
        notice: { kind: "info", text: "review the shared repo fixes, then choose apply or not now" },
        clearSession: false,
    };
};
const summarizeCurrentGalleryPanel = (item) => {
    const lines = [`output ${(0, cliShellConfig_1.quoteForPreview)(item.outputDir)}`];
    if (item.appliedFixes.length > 0) {
        lines.push(`safe fixes ${item.appliedFixes.join(", ")}`);
    }
    if (item.reviewUrl) {
        lines.push(`review ${item.reviewUrl}`);
    }
    if (item.attentionLines.length > 0) {
        for (const line of item.attentionLines.slice(0, 2)) {
            lines.push(line);
        }
    }
    else {
        lines.push("looks ready");
    }
    return {
        title: "gallery",
        kind: item.status === "needs-review" ? "info" : "success",
        lines,
    };
};
const runRepoBatchAction = (state, mode) => {
    const source = resolveRepoBatchSource(state);
    if (!source) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)(mode === "gallery" ? "gallery" : "repo fixes", "load a multi-robot repo first"),
            notice: { kind: "info", text: "no repo batch source yet" },
            clearSession: false,
        };
    }
    const execArgs = new Map();
    const repoSourceContext = getRepoSourceContext(state);
    if (repoSourceContext) {
        if (source.kind === "github") {
            execArgs.set("github", source.githubRef);
            const ref = repoSourceContext.loadArgs.get("ref");
            const subdir = repoSourceContext.loadArgs.get("subdir");
            if (typeof ref === "string" && ref.trim().length > 0) {
                execArgs.set("ref", ref);
            }
            if (typeof subdir === "string" && subdir.trim().length > 0) {
                execArgs.set("path", subdir);
            }
        }
        else {
            execArgs.set("local", source.localPath);
        }
    }
    else if (source.kind === "github") {
        execArgs.set("github", source.githubRef);
        if (typeof state.loadedSource?.githubRevision === "string" && state.loadedSource.githubRevision.trim().length > 0) {
            execArgs.set("ref", state.loadedSource.githubRevision);
        }
    }
    else {
        execArgs.set("local", source.localPath);
    }
    const execution = executeCliCommand(mode === "gallery" ? "gallery-generate" : "repo-fixes", execArgs);
    const result = parseExecutionJson(execution);
    if (!result) {
        const panel = buildPreviewErrorPanel(mode === "gallery" ? "gallery" : "repo fixes", execution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, mode === "gallery" ? "gallery generation failed" : "repo fixes failed"),
            clearSession: false,
        };
    }
    if (state.repoIntentPrompt) {
        clearRepoIntentPrompt(state);
    }
    const readyCount = result.generatedCount + result.generatedWithFixesCount;
    return {
        panel: summarizeGalleryBatchPanel(mode, result),
        notice: {
            kind: result.needsReviewCount === 0 && result.skippedCount === 0 ? "success" : "info",
            text: mode === "gallery"
                ? result.needsReviewCount === 0
                    ? "gallery assets generated"
                    : "gallery assets generated. review the flagged robots"
                : result.needsReviewCount === 0
                    ? "repo looks ready for gallery"
                    : readyCount > 0
                        ? "repo fixes finished. gallery is ready for the repaired robots"
                        : "repo fixes finished. review the flagged robots before gallery",
        },
        clearSession: false,
    };
};
const runCurrentGalleryAction = (state) => {
    const urdfPath = state.loadedSource?.urdfPath || state.lastUrdfPath;
    if (!urdfPath || !fs.existsSync(urdfPath)) {
        return {
            panel: (0, cliShellUi_1.createOutputPanel)("gallery", "load a robot first"),
            notice: { kind: "info", text: "no loaded robot yet" },
            clearSession: false,
        };
    }
    const execution = executeCliCommand("gallery-generate", new Map([["urdf", urdfPath]]));
    const item = parseExecutionJson(execution);
    if (!item) {
        const panel = buildPreviewErrorPanel("gallery", execution);
        return {
            panel,
            notice: buildShellFailureNotice(panel, "gallery generation failed"),
            clearSession: false,
        };
    }
    return {
        panel: summarizeCurrentGalleryPanel(item),
        notice: {
            kind: item.status === "needs-review" ? "info" : "success",
            text: item.status === "needs-review" ? "gallery assets generated. review the robot" : "gallery assets generated",
        },
        clearSession: false,
    };
};
const activateRepoIntentPrompt = (state, payload, loadArgs, extractedArchivePath) => {
    state.session = null;
    state.rootTask = null;
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    (0, cliShellConfig_1.clearXacroRetry)(state);
    const sourceLabel = extractedArchivePath ??
        payload.repositoryUrl ??
        (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : payload.inspectedPath ?? "repo");
    const nextContext = {
        sourceLabel,
        payload,
        loadArgs,
        extractedArchivePath,
    };
    state.repoSourceContext = nextContext;
    state.repoIntentPrompt = {
        ...nextContext,
        selectedIndex: 0,
    };
};
const resolveRepoIntentSelectionInput = (prompt, rawValue) => {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
        return (getRepoIntentMenuEntries()[(0, cliShellConfig_1.clamp)(prompt.selectedIndex, 0, getRepoIntentMenuEntries().length - 1)]
            ?.name ?? null);
    }
    if (/^\d+$/.test(trimmed)) {
        const index = Number(trimmed) - 1;
        if (index >= 0 && index < getRepoIntentMenuEntries().length) {
            prompt.selectedIndex = index;
            return getRepoIntentMenuEntries()[index]?.name ?? null;
        }
        return null;
    }
    const normalized = trimmed.toLowerCase();
    return (getRepoIntentMenuEntries().find((entry) => entry.name === normalized)?.name ??
        null);
};
const runRepoIntentChoice = (state, choice) => {
    const repoContext = getRepoSourceContext(state);
    if (!repoContext) {
        return {
            panel: null,
            notice: { kind: "info", text: "paste a repo first" },
            clearSession: false,
        };
    }
    if (choice === "work-one") {
        state.candidatePicker = {
            candidates: repoContext.payload.candidates,
            selectedIndex: 0,
            loadArgs: cloneArgsMap(repoContext.loadArgs),
            extractedArchivePath: repoContext.extractedArchivePath,
        };
        clearRepoIntentPrompt(state);
        return {
            panel: repoContext.payload.candidateCount > 0
                ? summarizeRepositoryPreview(createSession("load-source", state, "open"), repoContext.payload, {
                    sourceLabelOverride: repoContext.extractedArchivePath
                        ? (0, cliShellConfig_1.quoteForPreview)(repoContext.extractedArchivePath)
                        : undefined,
                })
                : null,
            notice: { kind: "info", text: "choose a robot. arrows move, enter loads" },
            clearSession: false,
        };
    }
    if (choice === "repo-fixes") {
        return previewRepoFixesAction(state);
    }
    return runRepoBatchAction(state, "gallery");
};
const summarizeDirectUrdfChecks = (urdfPath, validation, health, suggestedAction = null) => {
    const lines = [`source ${(0, cliShellConfig_1.quoteForPreview)(urdfPath)}`];
    lines.push((0, cliShellRecommendations_1.getValidationStatusLine)(validation));
    lines.push((0, cliShellRecommendations_1.getHealthStatusLine)(health));
    if (health.orientationGuess?.likelyUpAxis && health.orientationGuess?.likelyForwardAxis) {
        lines.push(`orientation likely ${formatOrientationGuessSummary(health.orientationGuess)}`);
    }
    for (const line of (0, cliShellRecommendations_1.collectAttentionLines)(validation.issues, health.findings, 2)) {
        lines.push(line);
    }
    (0, cliShellRecommendations_1.appendSuggestedActionLines)(lines, suggestedAction, "next /align /analyze /health /validate /orientation or paste another source");
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
                        clearSession: true,
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
                    activateRepoIntentPrompt(state, preview.payload, cloneArgsMap(execArgs), extractedArchivePath);
                    (0, cliShellConfig_1.clearCandidatePicker)(state);
                    return {
                        panel: preview.panel,
                        notice: { kind: "info", text: "choose what to do with this repo" },
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
                clearSession: panel?.title !== "xacro",
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
                clearSession: true,
            };
        }
        state.suggestedAction = getFollowUpSuggestedAction(state, {
            urdfPath,
            validation: validationPayload,
            health: healthPayload,
        });
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
            state.suggestedAction = getFollowUpSuggestedAction(state, {
                urdfPath,
                validation: {
                    isValid: true,
                    issues: [],
                },
                health: payload,
            });
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
            const healthPreviewExecution = executeCliCommand("health-check", new Map([["urdf", urdfPath]]));
            const healthPreviewPayload = parseExecutionJson(healthPreviewExecution);
            setPreparedSuggestedAction(state, (0, cliShellRecommendations_1.detectSuggestedAction)(state, {
                urdfPath,
                orientationGuess: healthPreviewPayload?.orientationGuess,
            }));
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
            state.suggestedAction = getFollowUpSuggestedAction(state, {
                urdfPath,
                validation: validationPayload,
                health: healthPayload,
            });
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
            if (typeof urdfPath === "string" && urdfPath.trim().length > 0) {
                if (session.command === "health-check") {
                    const payload = parseExecutionJson(result);
                    setPreparedSuggestedAction(state, (0, cliShellRecommendations_1.detectSuggestedAction)(state, {
                        urdfPath,
                        orientationGuess: payload?.orientationGuess,
                    }));
                }
                else if (session.command === "guess-orientation") {
                    const payload = parseExecutionJson(result);
                    setPreparedSuggestedAction(state, (0, cliShellRecommendations_1.detectSuggestedAction)(state, {
                        urdfPath,
                        orientationGuess: payload,
                    }));
                }
                else {
                    setPreparedSuggestedAction(state, (0, cliShellRecommendations_1.detectSuggestedAction)(state, { urdfPath }));
                }
            }
            else {
                state.suggestedAction = null;
            }
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
            return payload && typeof urdfPath === "string" ? summarizeOrientationResult(payload, urdfPath, state.suggestedAction) : null;
        }
        case "urdf-to-mjcf": {
            const payload = parseExecutionJson(execution);
            const urdfPath = session.args.get("urdf");
            return payload && typeof urdfPath === "string" ? summarizeMjcfExportResult(urdfPath, payload) : null;
        }
        case "urdf-to-usd": {
            const payload = parseExecutionJson(execution);
            return payload ? summarizeUsdExportResult(session, payload) : null;
        }
        default:
            return null;
    }
};
const tryCreateLoadedRootQuickSession = (state, command) => {
    if (!AUTO_RUN_READY_COMMANDS.has(command) || !hasRunnableRobotContext(state)) {
        return null;
    }
    const session = createSession(command, state, command);
    return getRequirementStatus(session).ready ? session : null;
};
const shouldAutoRunSession = (session) => AUTO_RUN_READY_COMMANDS.has(session.command) && getRequirementStatus(session).ready;
const getRootIdleMessage = (state) => state.repoSourceContext
    ? "nothing is pending. use /work-one /gallery /repo-fixes or paste another source"
    : state.lastUrdfPath
        ? "nothing is pending. use /align /analyze /health /validate /orientation or paste another source"
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
    syncSuggestedExportOutPath(state, session, feedback);
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
                ...getSessionMenuEntries(state, state.session).map((entry) => entry.name),
                ...cliShellConfig_1.HIDDEN_SHELL_COMMAND_NAMES,
            ]),
        ];
    }
    return [
        ...new Set([
            ...getRootMenuEntries(state).map((entry) => entry.name),
            ...cliShellConfig_1.ROOT_TASKS.flatMap((task) => getRootTaskActionDefinitions(task.name)
                .map((entry) => entry.name)
                .filter((name, index, array) => array.indexOf(name) === index)),
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
const openPendingForSession = (state, session, pending) => {
    if (!pending) {
        return;
    }
    if (pending.onlyIfMissing && session.args.has(pending.key)) {
        return;
    }
    session.pending = getPendingValuePrompt(state, session, pending.key, pending.slashName);
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
    clearRepoIntentPrompt(state);
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.session = createSession(action.command, state, action.sessionLabel, feedback);
    if (state.session) {
        openPendingForSession(state, state.session, action.openPending);
    }
};
const startRootShellCommand = (entry, state, feedback) => {
    state.rootTask = null;
    clearRepoIntentPrompt(state);
    (0, cliShellConfig_1.clearCandidatePicker)(state);
    (0, cliShellConfig_1.clearXacroRetry)(state);
    state.session = createSession(entry.command, state, entry.sessionLabel, feedback);
    if (state.session) {
        openPendingForSession(state, state.session, entry.openPending);
    }
};
const printVisualizerShellAction = async (state) => {
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("starting URDF Studio if needed...")}\n`);
    const result = await (0, sharedSession_1.openVisualizerForShellState)(state);
    seedSaveBaselineFromCurrentSharedSessionIfUnset(state);
    if (result.notice) {
        (0, cliShellConfig_1.writeFeedback)(result.notice);
    }
    (0, cliShellUi_1.printOutputPanel)(result.panel);
};
const printVisualizerStopShellAction = async (state) => {
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("stopping URDF Studio...")}\n`);
    const result = await runStopVisualizerAction(state);
    if (result.notice) {
        (0, cliShellConfig_1.writeFeedback)(result.notice);
    }
    (0, cliShellUi_1.printOutputPanel)(result.panel);
};
const printSavePromptLine = (savePrompt) => {
    if (savePrompt.phase === "confirm") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getSaveExitPromptText())}\n`);
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("  Enter chooses a save path. Type n to exit without saving.")}\n`);
        return;
    }
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getSavePathPromptText(savePrompt))}\n`);
};
const handleRootSlashCommand = async (slashCommand, state, close) => {
    if (!slashCommand || slashCommand === "help") {
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        else {
            printRootOptions(state);
        }
        return;
    }
    if (getRepoSourceContext(state) && REPO_INTENT_MENU_ENTRIES.some((entry) => entry.name === slashCommand)) {
        const result = runRepoIntentChoice(state, slashCommand);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        else if (state.candidatePicker) {
            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
        }
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
    if (slashCommand === "align") {
        const alignSuggestedAction = getAlignOrientationSuggestedAction(state.suggestedAction);
        const busyLine = alignSuggestedAction
            ? getSuggestedActionBusyState(alignSuggestedAction).lines[0]
            : "checking orientation...";
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(busyLine)}\n`);
        const result = runAlignOrientationAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return;
    }
    if (slashCommand === "work-one") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("opening the robot picker...")}\n`);
        const result = runRepoIntentChoice(state, "work-one");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.candidatePicker) {
            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
        }
        return;
    }
    if (slashCommand === "gallery") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating cards and thumbnails...")}\n`);
        const result = await runRepoBatchAction(state, "gallery");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        return;
    }
    if (slashCommand === "gallery-current") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating the current gallery assets...")}\n`);
        const result = runCurrentGalleryAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return;
    }
    if (slashCommand === "repo-fixes") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("reviewing shared repo issues...")}\n`);
        const result = previewRepoFixesAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        return;
    }
    if (slashCommand === "visualize") {
        await printVisualizerShellAction(state);
        return;
    }
    if (slashCommand === "visualize-stop") {
        await printVisualizerStopShellAction(state);
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
    const rootTaskAction = findUniqueRootTaskAction(slashCommand);
    if (rootTaskAction) {
        const feedback = [];
        startRootTaskAction(rootTaskAction.task, rootTaskAction.action, state, feedback);
        (0, cliShellConfig_1.flushFeedback)(feedback);
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
const handleRootTaskSlashCommand = async (slashCommand, state, close) => {
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
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("nothing is pending here. paste a source or use /")}\n`);
        return;
    }
    if (slashCommand === "align") {
        const alignSuggestedAction = getAlignOrientationSuggestedAction(state.suggestedAction);
        const busyLine = alignSuggestedAction
            ? getSuggestedActionBusyState(alignSuggestedAction).lines[0]
            : "checking orientation...";
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(busyLine)}\n`);
        const result = runAlignOrientationAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return;
    }
    if (slashCommand === "work-one") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("opening the robot picker...")}\n`);
        const result = runRepoIntentChoice(state, "work-one");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.candidatePicker) {
            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
        }
        return;
    }
    if (slashCommand === "gallery") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating cards and thumbnails...")}\n`);
        const result = await runRepoBatchAction(state, "gallery");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        return;
    }
    if (slashCommand === "gallery-current") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating the current gallery assets...")}\n`);
        const result = runCurrentGalleryAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return;
    }
    if (slashCommand === "repo-fixes") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("reviewing shared repo issues...")}\n`);
        const result = previewRepoFixesAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        return;
    }
    if (slashCommand === "visualize") {
        await printVisualizerShellAction(state);
        return;
    }
    if (slashCommand === "visualize-stop") {
        await printVisualizerStopShellAction(state);
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
const handleSessionSlashCommand = async (slashCommand, inlineValue, state, close) => {
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
    if (slashCommand === "work-one") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("opening the robot picker...")}\n`);
        const result = runRepoIntentChoice(state, "work-one");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.candidatePicker) {
            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
        }
        return;
    }
    if (slashCommand === "gallery") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating cards and thumbnails...")}\n`);
        const result = await runRepoBatchAction(state, "gallery");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        return;
    }
    if (slashCommand === "gallery-current") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating the current gallery assets...")}\n`);
        const result = runCurrentGalleryAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return;
    }
    if (slashCommand === "repo-fixes") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("reviewing shared repo issues...")}\n`);
        const result = previewRepoFixesAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
        }
        return;
    }
    if (slashCommand === "visualize") {
        await printVisualizerShellAction(state);
        return;
    }
    if (slashCommand === "visualize-stop") {
        await printVisualizerStopShellAction(state);
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
        close();
        return;
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
        if (setSessionValue(state, session, target.key, inlineValue, feedback)) {
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
                    clearInteractiveFlowState(state);
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
    session.pending = getPendingValuePrompt(state, session, target.key, slashCommand);
    printPendingValuePrompt(session.pending);
};
const handlePendingValue = (input, state) => {
    const session = state.session;
    if (!session?.pending) {
        return;
    }
    const feedback = [];
    if (setSessionValue(state, session, session.pending.key, input, feedback)) {
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
                clearInteractiveFlowState(state);
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
const applyFreeformInputToSession = (state, session, rawValue, feedback) => {
    const target = inferFreeformSessionTarget(session, rawValue);
    if (!target) {
        return null;
    }
    if (!setSessionValue(state, session, target.key, target.value, feedback)) {
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
    clearRepoSourceContext(state);
    state.rootTask = null;
    state.session = createSession(plan.command, state, plan.label, feedback);
    if (!state.session || !setSessionValue(state, state.session, plan.key, plan.value, feedback)) {
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
const ALIGN_ROOT_MENU_ENTRY = {
    name: "align",
    summary: "Align the loaded source to the recommended orientation.",
    kind: "action",
};
const GALLERY_ROOT_MENU_ENTRY = {
    name: "gallery",
    summary: "Generate cards and thumbnails from the current robot or repo.",
    kind: "action",
};
const GALLERY_CURRENT_ROOT_MENU_ENTRY = {
    name: "gallery-current",
    summary: "Generate gallery assets only for the current loaded robot.",
    kind: "action",
};
const REPO_FIXES_ROOT_MENU_ENTRY = {
    name: "repo-fixes",
    summary: "Apply shared safe fixes across a multi-robot repo.",
    kind: "action",
};
const REPO_INTENT_MENU_ENTRIES = [
    {
        name: "work-one",
        summary: "Pick one robot from this repo and work on it.",
        kind: "action",
    },
    {
        name: "gallery",
        summary: "Generate cards and thumbnails for every robot in this repo.",
        kind: "action",
    },
    {
        name: "repo-fixes",
        summary: "Apply shared safe fixes across the repo before review.",
        kind: "action",
    },
];
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
const isRepoBackedLoadedSource = (state) => state.loadedSource?.source === "github" || state.loadedSource?.source === "local-repo";
const hasRunnableRobotContext = (state) => {
    if (state.repoSourceContext && !state.loadedSource) {
        return false;
    }
    return Boolean(state.loadedSource?.urdfPath || state.lastUrdfPath);
};
const getRepoSourceContext = (state) => state.repoIntentPrompt
    ? {
        sourceLabel: state.repoIntentPrompt.sourceLabel,
        payload: state.repoIntentPrompt.payload,
        loadArgs: state.repoIntentPrompt.loadArgs,
        extractedArchivePath: state.repoIntentPrompt.extractedArchivePath,
    }
    : state.repoSourceContext;
const canRunRepoBatchActions = (state) => Boolean(getRepoSourceContext(state)) || isRepoBackedLoadedSource(state);
const canWorkOneFromRepoSource = (state) => Boolean(getRepoSourceContext(state)) && !isRepoBackedLoadedSource(state);
const canRunCurrentGallery = (state) => Boolean(state.loadedSource?.urdfPath || state.lastUrdfPath);
const clearRepoIntentPrompt = (state) => {
    state.repoIntentPrompt = null;
};
const clearRepoSourceContext = (state) => {
    state.repoSourceContext = null;
};
const getRepoIntentMenuEntries = () => REPO_INTENT_MENU_ENTRIES;
const getLoadedRootCommandList = (state) => {
    if (canWorkOneFromRepoSource(state) && !hasRunnableRobotContext(state)) {
        return REPO_INTENT_MENU_ENTRIES.map(({ name, summary }) => ({ name, summary }));
    }
    return [
        { name: ALIGN_ROOT_MENU_ENTRY.name, summary: ALIGN_ROOT_MENU_ENTRY.summary },
        ...(canRunCurrentGallery(state)
            ? [
                { name: GALLERY_ROOT_MENU_ENTRY.name, summary: GALLERY_ROOT_MENU_ENTRY.summary },
                { name: GALLERY_CURRENT_ROOT_MENU_ENTRY.name, summary: GALLERY_CURRENT_ROOT_MENU_ENTRY.summary },
            ]
            : []),
        ...(canRunRepoBatchActions(state)
            ? [{ name: REPO_FIXES_ROOT_MENU_ENTRY.name, summary: REPO_FIXES_ROOT_MENU_ENTRY.summary }]
            : []),
        ...LOADED_ROOT_MENU_ENTRIES.map(({ name, summary }) => ({ name, summary })),
    ];
};
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
    if (state.repoIntentPrompt) {
        return getRepoIntentMenuEntries();
    }
    if (state.rootTask) {
        return getFullRootMenuEntries();
    }
    if (canWorkOneFromRepoSource(state) && !hasRunnableRobotContext(state)) {
        return [
            ...REPO_INTENT_MENU_ENTRIES,
            ...ROOT_SYSTEM_MENU_ENTRIES,
        ];
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
        addEntry(ALIGN_ROOT_MENU_ENTRY);
        addEntry(GALLERY_ROOT_MENU_ENTRY);
        addEntry(GALLERY_CURRENT_ROOT_MENU_ENTRY);
        if (canRunRepoBatchActions(state)) {
            addEntry(REPO_FIXES_ROOT_MENU_ENTRY);
        }
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
const getSessionMenuEntries = (state, session) => {
    const entries = shouldSuppressSessionOptionMenu(session)
        ? []
        : getVisibleSessionOptionEntries(session).map((entry) => ({
            name: entry.name,
            summary: entry.summary,
            kind: "option",
        }));
    if (canRunCurrentGallery(state)) {
        entries.push(GALLERY_ROOT_MENU_ENTRY);
        entries.push(GALLERY_CURRENT_ROOT_MENU_ENTRY);
    }
    if (canRunRepoBatchActions(state)) {
        entries.push(REPO_FIXES_ROOT_MENU_ENTRY);
    }
    if (canWorkOneFromRepoSource(state) && !hasRunnableRobotContext(state)) {
        entries.push(REPO_INTENT_MENU_ENTRIES[0]);
    }
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
    const primaryEntries = matchMenuEntries(state.session ? getSessionMenuEntries(state, state.session) : getRootMenuEntries(state), parsed.slashCommand);
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
    const suppressLoadedNarrative = panel?.title === "loaded";
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
    if (panelNarrative && !suppressLoadedNarrative) {
        lines.push(panelNarrative);
    }
    if (notice?.text && shouldIncludeNoticeText && !suppressLoadedNarrative) {
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
            return cliShellConfig_1.SHELL_THEME.muted(text);
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
    return selected
        ? `${cliShellConfig_1.SHELL_THEME.accent(left)}${cliShellConfig_1.SHELL_THEME.muted(`${summary}${badgeSuffix}`)}`
        : `${cliShellConfig_1.SHELL_THEME.command(left)}${cliShellConfig_1.SHELL_THEME.muted(`${summary}${badgeSuffix}`)}`;
};
const getPromptPlaceholder = (state) => {
    if (state.savePrompt?.phase === "path") {
        return `save path  Enter uses ${(0, cliShellConfig_1.quoteForPreview)(state.savePrompt.defaultPath)}`;
    }
    if (state.exitPrompt) {
        return state.exitPrompt.canStopVisualizer
            ? "up/down choose, Enter confirms, 1 quits Studio, 2 keeps it open"
            : "up/down choose, Enter confirms, 1 exits, 2 stays here";
    }
    if (!state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker && state.resumePrompt) {
        return "Enter resumes the last session or Esc skips";
    }
    if (!state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker && state.updatePrompt) {
        return "Enter updates now or Esc skips";
    }
    if (state.repoIntentPrompt) {
        return "arrows choose what to do with this repo, Enter selects";
    }
    if (state.candidatePicker) {
        return "arrows choose a match, Enter loads it";
    }
    if (state.session?.pending) {
        return state.session.pending.examples[0] ?? state.session.pending.title;
    }
    if (state.session?.label === "open" && state.session.args.size === 0) {
        return "paste repo or local path";
    }
    if (state.session?.label === "inspect" && state.session.args.size === 0) {
        return "paste repo or local folder";
    }
    if (!state.session && state.rootTask) {
        switch (state.rootTask) {
            case "open":
                return "paste repo or local path";
            case "inspect":
                return "paste repo or local folder or .urdf";
            case "check":
                return "drop a local .urdf or use /health /validate /orientation";
            case "convert":
                return "drop a local .xacro or use /xacro /mjcf /usd";
            case "fix":
                return "paste repo or local folder or .urdf";
        }
    }
    if (!state.session) {
        if (state.repoSourceContext) {
            return "use /work-one /gallery /repo-fixes or paste another source";
        }
        if (state.lastUrdfPath) {
            return "use /align /analyze /health /validate /orientation or paste another source";
        }
        return "paste repo or local path  / for actions";
    }
    const requirementStatus = getRequirementStatus(state.session);
    if (requirementStatus.ready) {
        return "press Enter to run";
    }
    return `set ${requirementStatus.nextSteps
        .map((step) => formatSlashSequence(state.session, step))
        .join(" or ")}`;
};
const buildTtyShellFrame = (state, view) => {
    const columns = process.stdout.columns ?? 100;
    const rows = process.stdout.rows ?? 24;
    const activeChoicePrompt = getActiveTtyChoicePrompt(state);
    const activeExitPrompt = activeChoicePrompt?.kind === "exit" ? activeChoicePrompt.prompt : null;
    const activeSuggestedAction = activeChoicePrompt?.kind === "suggested" ? activeChoicePrompt.prompt : null;
    const promptSelectionKey = getTtyChoicePromptSelectionKey(activeChoicePrompt);
    if (view.promptSelectionKey !== promptSelectionKey) {
        view.promptSelectionKey = promptSelectionKey;
        view.promptOptionIndex = 0;
    }
    const menuEntries = getSlashMenuEntries(state, view.input);
    const menuWindow = getMenuWindow(menuEntries, view.menuIndex, Math.max(4, Math.min(8, rows - 16)));
    view.menuIndex = menuWindow.selectedIndex;
    const hasHistory = view.timeline.length > 0 || Boolean(view.output) || Boolean(view.notice);
    const lines = [];
    lines.push(`${cliShellConfig_1.SHELL_THEME.brand(cliShellConfig_1.SHELL_BRAND)} ${cliShellConfig_1.SHELL_THEME.muted("urdf shell")}`);
    if (!hasHistory) {
        lines.push(cliShellConfig_1.SHELL_THEME.muted(cliShellConfig_1.ROOT_GUIDANCE));
    }
    if (state.repoIntentPrompt) {
        for (const row of getPersistentTtyContextRows([
            { label: "source", value: state.repoIntentPrompt.sourceLabel },
            { label: "found", value: formatCount(state.repoIntentPrompt.payload.candidateCount, "robot") },
            { label: "next", value: "choose one robot, generate the repo gallery, or apply shared fixes", tone: "accent" },
        ], hasHistory)) {
            lines.push((0, cliShellUi_1.renderContextRow)(row));
        }
    }
    else if (state.candidatePicker && state.session) {
        const selectedCandidate = state.candidatePicker.candidates[(0, cliShellConfig_1.clamp)(state.candidatePicker.selectedIndex, 0, state.candidatePicker.candidates.length - 1)];
        const rows = [...getPersistentTtyContextRows(getSessionContextRows(state, state.session), hasHistory)].filter((row) => row.label !== "next");
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
        for (const row of getPersistentTtyContextRows(getSessionContextRows(state, state.session), hasHistory)) {
            lines.push((0, cliShellUi_1.renderContextRow)(row));
        }
    }
    else if (state.rootTask) {
        for (const row of getPersistentTtyContextRows([
            { label: "source", value: "none yet", tone: "muted" },
            { label: "action", value: getRootTaskSummary(state.rootTask), tone: "muted" },
            { label: "next", value: "paste input directly or type /", tone: "accent" },
        ], hasHistory)) {
            lines.push((0, cliShellUi_1.renderContextRow)(row));
        }
    }
    else {
        for (const row of getPersistentTtyContextRows(getLoadedSourceContextRows(state), hasHistory).filter((row) => !(hasHistory && row.label === "next"))) {
            lines.push((0, cliShellUi_1.renderContextRow)(row));
        }
        if (!getReadySourceLabel(state) && !hasHistory) {
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
    if (state.resumePrompt && !view.busy) {
        lines.push(`  ${cliShellConfig_1.SHELL_THEME.icon("↺")} ${cliShellConfig_1.SHELL_THEME.muted(formatResumePromptLine(state.resumePrompt))}`);
    }
    if (state.updatePrompt && !state.resumePrompt && !view.busy) {
        lines.push(`  ${cliShellConfig_1.SHELL_THEME.icon("↑")} ${cliShellConfig_1.SHELL_THEME.muted((0, cliShellConfig_1.formatUpdatePromptLine)(state.updatePrompt))}`);
    }
    if (activeChoicePrompt && !view.busy) {
        lines.push(`  ${cliShellConfig_1.SHELL_THEME.icon("→")} ${cliShellConfig_1.SHELL_THEME.muted(activeChoicePrompt.text)}`);
        lines.push(`  ${renderTtyChoicePromptLine(activeChoicePrompt.options[0], 0, view.promptOptionIndex)}`);
        lines.push(`  ${renderTtyChoicePromptLine(activeChoicePrompt.options[1], 1, view.promptOptionIndex)}`);
        lines.push(`  ${renderTtyChoicePromptHintLine(activeChoicePrompt)}`);
    }
    if (state.savePrompt?.phase === "path" && !view.busy) {
        lines.push(`  ${cliShellConfig_1.SHELL_THEME.icon("→")} ${cliShellConfig_1.SHELL_THEME.muted(getSavePathPromptText(state.savePrompt))}`);
    }
    if (shouldRenderInlineNotice(view)) {
        lines.push(`  ${renderNotice(view.notice)}`);
    }
    const promptLabel = (0, cliShellConfig_1.formatShellPrompt)(state).trimEnd();
    const promptLineIndex = lines.length;
    const shouldShowPlaceholder = view.input.length === 0 &&
        !view.busy &&
        !activeExitPrompt &&
        !activeSuggestedAction &&
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
    else if (state.repoIntentPrompt && !view.input.startsWith("/")) {
        lines.push(cliShellConfig_1.SHELL_THEME.section("next"));
        for (const [index, entry] of getRepoIntentMenuEntries().entries()) {
            const selected = index === state.repoIntentPrompt.selectedIndex;
            lines.push(renderMenuEntry(entry, selected, columns - 2));
        }
    }
    else if (state.candidatePicker && !view.input.startsWith("/")) {
        lines.push(cliShellConfig_1.SHELL_THEME.section("picker"));
        for (const [index, candidate] of state.candidatePicker.candidates.slice(0, 8).entries()) {
            const details = (0, cliShellRecommendations_1.getCandidateDetails)(candidate);
            const line = `${candidate.path}${details.length > 0 ? `  ${details.join("  ")}` : ""}`;
            const selected = index === state.candidatePicker.selectedIndex;
            lines.push(selected
                ? `  ${cliShellConfig_1.SHELL_THEME.accent(">")} ${cliShellConfig_1.SHELL_THEME.command(candidate.path)}${details.length > 0 ? `  ${cliShellConfig_1.SHELL_THEME.muted(truncateText(details.join("  "), columns - candidate.path.length - 8))}` : ""}`
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
    return {
        lines,
        promptLabel,
        promptLineIndex,
    };
};
const renderTtyShell = (state, view) => {
    const { lines, promptLabel, promptLineIndex } = buildTtyShellFrame(state, view);
    process.stdout.write("\u001b[H\u001b[J");
    process.stdout.write(lines.join("\n"));
    const linesBelowPrompt = lines.length - promptLineIndex - 1;
    if (linesBelowPrompt > 0) {
        process.stdout.write(`\u001b[${linesBelowPrompt}A`);
    }
    process.stdout.write("\r");
    process.stdout.write(`\u001b[${(0, cliShellConfig_1.stripAnsi)(`${promptLabel} ${view.input}`).length}C`);
};
const printTtyShellSnapshot = (state, view) => {
    const { lines } = buildTtyShellFrame(state, view);
    process.stdout.write("\u001b[H\u001b[J");
    process.stdout.write(lines.join("\n"));
    process.stdout.write("\n");
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
        repoIntentPrompt: null,
        repoSourceContext: null,
        candidatePicker: null,
        xacroRetry: null,
        loadedSource: null,
        sharedSessionId: undefined,
        resumePrompt: null,
        updatePrompt: null,
        suggestedAction: null,
        visualizerPromptResolved: false,
        visualizerOpened: false,
        savePrompt: null,
        saveBaselineHash: undefined,
        saveBaselineUpdatedAt: undefined,
        exitPrompt: null,
    };
    let isClosed = false;
    const visualizerExitGuard = createVisualizerExitGuard(state);
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
    const closeLineShell = () => {
        clearSavePrompt(state);
        clearExitPrompt(state);
        close();
    };
    const requestLineClose = () => {
        if (beginSaveExitPrompt(state)) {
            printSavePromptLine(state.savePrompt);
            return;
        }
        closeLineShell();
    };
    rl.on("SIGINT", () => {
        process.stdout.write("\n");
        if (state.savePrompt?.phase === "path") {
            state.savePrompt = {
                ...state.savePrompt,
                phase: "confirm",
            };
            printSavePromptLine(state.savePrompt);
        }
        else if (state.savePrompt) {
            closeLineShell();
            return;
        }
        else {
            requestLineClose();
        }
        if (!isClosed) {
            rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
            rl.prompt();
        }
    });
    (0, cliShellUi_1.printRootQuickStart)();
    if (options.attachSessionId) {
        try {
            const snapshot = (0, sharedSession_1.attachShellToSharedSession)(state, options.attachSessionId);
            syncSaveBaselineFromSnapshot(state, snapshot);
            process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(`attached session ${snapshot.sessionId}`)}\n`);
            (0, cliShellUi_1.printContextRows)(getLoadedSourceContextRows(state));
        }
        catch (error) {
            process.stdout.write(`${cliShellConfig_1.SHELL_THEME.warning(error instanceof Error ? error.message : String(error))}\n`);
        }
    }
    else if (!options.initialSlashCommand) {
        startStartupResumeCheck(state, (snapshot) => {
            process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(formatResumePromptLine(snapshot))}\n`);
        });
    }
    if (options.initialSlashCommand) {
        const parsed = parseSlashInput(options.initialSlashCommand);
        if (parsed) {
            handleRootSlashCommand(parsed.slashCommand, state, requestLineClose);
        }
    }
    rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
    rl.prompt();
    try {
        for await (const line of rl) {
            const trimmed = line.trim();
            const session = state.session;
            const isSlashInput = shouldTreatAsSlashInput(line, state);
            const bangCommand = parseBangInput(line);
            const activeSavePrompt = getActiveSavePrompt(state);
            const activeResumePrompt = getActiveResumePrompt(state);
            const activeSuggestedAction = getActiveSuggestedAction(state);
            if (!activeSavePrompt && activeSuggestedAction && (isSlashInput || bangCommand)) {
                bypassSuggestedAction(state, activeSuggestedAction);
            }
            if (activeSavePrompt) {
                if (activeSavePrompt.phase === "confirm") {
                    const normalizedDecision = trimmed.toLowerCase();
                    if (!trimmed || normalizedDecision === "y" || normalizedDecision === "yes" || normalizedDecision === "save") {
                        state.savePrompt = {
                            ...activeSavePrompt,
                            phase: "path",
                        };
                        printSavePromptLine(state.savePrompt);
                    }
                    else if (normalizedDecision === "n" ||
                        normalizedDecision === "no" ||
                        normalizedDecision === "skip" ||
                        normalizedDecision === "discard" ||
                        normalizedDecision === "later") {
                        clearSavePrompt(state);
                        closeLineShell();
                    }
                    else {
                        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getSaveDecisionHint("line"))}\n`);
                    }
                    if (!isClosed) {
                        rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
                        rl.prompt();
                    }
                    continue;
                }
                if (isSlashInput || bangCommand) {
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getSavePathPromptText(activeSavePrompt))}\n`);
                    rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
                    rl.prompt();
                    continue;
                }
                try {
                    const destinationPath = resolveSaveDestinationPath(line, activeSavePrompt.defaultPath);
                    const saveResult = saveWorkingUrdfToDestination(state, destinationPath);
                    state.saveBaselineHash = saveResult.savedHash;
                    state.saveBaselineUpdatedAt = getCurrentSharedSessionUpdatedAt(state);
                    clearSavePrompt(state);
                    (0, cliShellConfig_1.writeFeedback)({
                        kind: "success",
                        text: `saved working URDF to ${(0, cliShellConfig_1.quoteForPreview)(saveResult.destinationPath)}`,
                    });
                    closeLineShell();
                }
                catch (error) {
                    (0, cliShellConfig_1.writeFeedback)({
                        kind: "error",
                        text: error instanceof Error ? error.message : String(error),
                    });
                    printSavePromptLine(activeSavePrompt);
                }
                if (!isClosed) {
                    rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
                    rl.prompt();
                }
                continue;
            }
            if (activeResumePrompt && !state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker) {
                const normalizedDecision = trimmed.toLowerCase();
                if (!trimmed) {
                    try {
                        const snapshot = acceptResumePrompt(state);
                        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(`resumed session ${snapshot.sessionId}`)}\n`);
                        (0, cliShellUi_1.printContextRows)(getLoadedSourceContextRows(state));
                    }
                    catch (error) {
                        (0, cliShellConfig_1.writeFeedback)({
                            kind: "warning",
                            text: error instanceof Error ? error.message : String(error),
                        });
                    }
                    rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
                    rl.prompt();
                    continue;
                }
                if (normalizedDecision === "n" ||
                    normalizedDecision === "no" ||
                    normalizedDecision === "skip" ||
                    normalizedDecision === "fresh" ||
                    normalizedDecision === "later") {
                    dismissResumePrompt(state);
                    (0, cliShellConfig_1.writeFeedback)({ kind: "info", text: "starting fresh" });
                    rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
                    rl.prompt();
                    continue;
                }
                dismissResumePrompt(state);
            }
            if (activeSuggestedAction && !isSlashInput && !bangCommand) {
                const normalizedDecision = trimmed.toLowerCase();
                if (!trimmed || normalizedDecision === "y" || normalizedDecision === "yes") {
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getSuggestedActionBusyState(activeSuggestedAction).lines[0])}\n`);
                    const result = await runSuggestedActionAsync(state);
                    if (result.notice) {
                        (0, cliShellConfig_1.writeFeedback)(result.notice);
                    }
                    (0, cliShellUi_1.printOutputPanel)(result.panel);
                }
                else if (normalizedDecision === "n" ||
                    normalizedDecision === "no" ||
                    normalizedDecision === "later" ||
                    normalizedDecision === "not now") {
                    (0, cliShellConfig_1.writeFeedback)(skipSuggestedAction(state, activeSuggestedAction));
                }
                else {
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(getSuggestedActionDecisionHint(activeSuggestedAction, "line"))}\n`);
                }
                const nextSuggestedAction = getActiveSuggestedAction(state);
                if (!isClosed && nextSuggestedAction) {
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(nextSuggestedAction.prompt)}\n`);
                    process.stdout.write(`  ${renderSuggestedActionChoiceLine(nextSuggestedAction, "line")}\n`);
                }
                if (isClosed) {
                    break;
                }
                rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
                rl.prompt();
                continue;
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
            else if (state.repoIntentPrompt && !isSlashInput) {
                if (trimmed.length > 0 && inferFreeformRootPlan(state, line)) {
                    clearRepoIntentPrompt(state);
                }
                else {
                    const choice = resolveRepoIntentSelectionInput(state.repoIntentPrompt, line);
                    if (choice) {
                        const result = await runRepoIntentChoice(state, choice);
                        if (result.notice) {
                            (0, cliShellConfig_1.writeFeedback)(result.notice);
                        }
                        (0, cliShellUi_1.printOutputPanel)(result.panel);
                        if (state.repoIntentPrompt) {
                            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
                        }
                        else if (state.candidatePicker) {
                            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                        }
                    }
                    else {
                        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.warning("pick 1, 2, or 3 to choose the repo action")}\n`);
                        if (state.repoIntentPrompt) {
                            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
                        }
                    }
                }
            }
            else if (state.candidatePicker && !isSlashInput) {
                const selectedPath = resolveCandidateSelectionInput(state, line);
                if (selectedPath) {
                    const picker = state.candidatePicker;
                    const result = runSelectedCandidatePicker(state, picker, selectedPath);
                    if (result?.notice) {
                        (0, cliShellConfig_1.writeFeedback)(result.notice);
                    }
                    (0, cliShellUi_1.printOutputPanel)(result?.panel ?? null);
                    if (result?.clearSession) {
                        clearInteractiveFlowState(state);
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
                        await handleSessionSlashCommand(parsed.slashCommand, parsed.inlineValue, state, requestLineClose);
                    }
                    else if (state.rootTask) {
                        await handleRootTaskSlashCommand(parsed.slashCommand, state, requestLineClose);
                    }
                    else {
                        await handleRootSlashCommand(parsed.slashCommand, state, requestLineClose);
                    }
                }
            }
            else if (!trimmed) {
                if (session) {
                    if (!session.pending && getRequirementStatus(session).ready) {
                        printSessionCommandExecution(state, executeSessionCommand(state, session), session);
                    }
                    else {
                        printSessionStatus(state, session);
                    }
                }
                else if (state.repoIntentPrompt) {
                    (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
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
                const applied = applyFreeformInputToSession(state, session, line, feedback);
                if (applied) {
                    const automated = runDirectInputAutomation(state, applied.session, applied.key);
                    if (automated) {
                        if (automated.notice) {
                            (0, cliShellConfig_1.writeFeedback)(automated.notice);
                        }
                        (0, cliShellUi_1.printOutputPanel)(automated.panel);
                        if (state.repoIntentPrompt) {
                            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
                        }
                        if (state.candidatePicker) {
                            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                        }
                        if (automated.clearSession) {
                            clearInteractiveFlowState(state);
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
                        if (state.repoIntentPrompt) {
                            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, getRepoIntentMenuEntries());
                        }
                        if (state.candidatePicker) {
                            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
                        }
                    }
                }
                else {
                    (0, cliShellConfig_1.flushFeedback)(feedback);
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("paste repo or local path  / for actions")}\n`);
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
                            clearInteractiveFlowState(state);
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
                    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("paste repo or local path  / for actions")}\n`);
                }
            }
            const nextSuggestedAction = getActiveSuggestedAction(state);
            if (!isClosed && nextSuggestedAction) {
                process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(nextSuggestedAction.prompt)}\n`);
                process.stdout.write(`  ${renderSuggestedActionChoiceLine(nextSuggestedAction, "line")}\n`);
            }
            if (isClosed) {
                break;
            }
            rl.setPrompt((0, cliShellConfig_1.formatShellPrompt)(state));
            rl.prompt();
        }
    }
    finally {
        visualizerExitGuard.dispose();
    }
};
const runTtyInteractiveShell = async (options = {}) => {
    const state = {
        session: null,
        rootTask: null,
        repoIntentPrompt: null,
        repoSourceContext: null,
        candidatePicker: null,
        xacroRetry: null,
        loadedSource: null,
        sharedSessionId: undefined,
        resumePrompt: null,
        updatePrompt: null,
        suggestedAction: null,
        visualizerPromptResolved: false,
        visualizerOpened: false,
        savePrompt: null,
        saveBaselineHash: undefined,
        saveBaselineUpdatedAt: undefined,
        exitPrompt: null,
    };
    const view = {
        input: "",
        timeline: [],
        menuIndex: 0,
        promptOptionIndex: 0,
        promptSelectionKey: null,
        notice: null,
        output: null,
        busy: null,
    };
    let closed = false;
    let ignoreKeypressUntilMs = 0;
    const visualizerExitGuard = createVisualizerExitGuard(state);
    const close = () => {
        closed = true;
    };
    const setInput = (nextInput) => {
        view.input = nextInput;
        const menuEntries = getSlashMenuEntries(state, view.input);
        view.menuIndex = menuEntries.length === 0 ? 0 : (0, cliShellConfig_1.clamp)(view.menuIndex, 0, menuEntries.length - 1);
    };
    const syncActivePromptSelection = () => {
        const activeChoicePrompt = getActiveTtyChoicePrompt(state);
        const promptSelectionKey = getTtyChoicePromptSelectionKey(activeChoicePrompt);
        if (view.promptSelectionKey !== promptSelectionKey) {
            view.promptSelectionKey = promptSelectionKey;
            view.promptOptionIndex = 0;
        }
        return activeChoicePrompt;
    };
    const setPromptOptionIndex = (nextIndex) => {
        view.promptOptionIndex = (0, cliShellConfig_1.clamp)(nextIndex, 0, 1);
    };
    const resolvePromptShortcutSelection = (input) => {
        const normalizedInput = input.trim().toLowerCase();
        if (normalizedInput === "1" || normalizedInput === "y" || normalizedInput === "yes") {
            return 0;
        }
        if (normalizedInput === "2" ||
            normalizedInput === "n" ||
            normalizedInput === "no" ||
            normalizedInput === "skip" ||
            normalizedInput === "later") {
            return 1;
        }
        return null;
    };
    const finalizeTtyClose = (notice, options = {}) => {
        if (options.keepVisualizerOpen) {
            visualizerExitGuard.keepVisualizerOpenOnExit();
        }
        clearExitPrompt(state);
        setInput("");
        view.promptSelectionKey = null;
        view.promptOptionIndex = 0;
        view.output = null;
        view.notice = notice;
        close();
    };
    const continueTtyCloseFlow = (options = {}) => {
        if (beginVisualizerExitPrompt(state)) {
            setInput("");
            if (!options.preserveNotice) {
                view.notice = null;
            }
            if (!options.preserveOutput) {
                view.output = null;
            }
            view.promptSelectionKey = null;
            view.promptOptionIndex = 0;
            return;
        }
        clearSavePrompt(state);
        close();
    };
    const requestTtyClose = () => {
        if (beginSaveExitPrompt(state)) {
            setInput("");
            view.notice = null;
            view.output = null;
            view.promptSelectionKey = null;
            view.promptOptionIndex = 0;
            return;
        }
        continueTtyCloseFlow();
    };
    const runPromptSelection = async (selectedIndex) => {
        const activeChoicePrompt = syncActivePromptSelection();
        if (!activeChoicePrompt) {
            return;
        }
        const normalizedIndex = (0, cliShellConfig_1.clamp)(selectedIndex, 0, 1);
        if (activeChoicePrompt.kind === "save") {
            if (normalizedIndex === 0) {
                state.savePrompt = {
                    ...activeChoicePrompt.prompt,
                    phase: "path",
                };
                setInput("");
                view.notice = {
                    kind: "info",
                    text: getSavePathPromptText(state.savePrompt),
                };
                view.output = null;
                return;
            }
            clearSavePrompt(state);
            if (activeChoicePrompt.prompt.closeAfterSave) {
                continueTtyCloseFlow();
            }
            else {
                view.notice = { kind: "info", text: "save cancelled" };
            }
            return;
        }
        if (activeChoicePrompt.kind === "exit") {
            if (normalizedIndex === 0) {
                if (activeChoicePrompt.prompt.canStopVisualizer) {
                    const stopped = await stopVisualizerInTty();
                    if (stopped) {
                        close();
                    }
                    return;
                }
                finalizeTtyClose(getVisualizerDisconnectNotice(state));
                return;
            }
            if (activeChoicePrompt.prompt.canStopVisualizer) {
                finalizeTtyClose(getVisualizerDisconnectNotice(state), { keepVisualizerOpen: true });
            }
            else {
                clearExitPrompt(state);
                view.promptSelectionKey = null;
                view.promptOptionIndex = 0;
                view.notice = { kind: "info", text: "kept the shell open" };
            }
            return;
        }
        if (normalizedIndex === 0) {
            pushTimelineUserEntry(view, `yes, ${activeChoicePrompt.prompt.acceptLabel}`);
            const result = await runBusyOperationAsync(getSuggestedActionBusyState(activeChoicePrompt.prompt), () => runSuggestedActionAsync(state));
            view.notice = result.notice;
            view.output = result.panel;
            archiveAssistantStateToTimeline(view);
            setInput("");
            return;
        }
        view.notice = skipSuggestedAction(state, activeChoicePrompt.prompt);
        setInput("");
    };
    const openSession = (command) => {
        const feedback = [];
        state.rootTask = null;
        clearRepoIntentPrompt(state);
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
        clearRepoIntentPrompt(state);
        (0, cliShellConfig_1.clearCandidatePicker)(state);
        (0, cliShellConfig_1.clearXacroRetry)(state);
        setInput("/");
        view.notice = { kind: "info", text: `${getRootTaskSummary(task)}  choose below or paste input directly` };
        pushTimelineUserEntry(view, `/${task}`);
        pushTimelineAssistantEntry(view, [`action ${getRootTaskSummary(task)}`, "next paste input directly or type /"], "info");
        view.notice = null;
    };
    if (options.attachSessionId) {
        try {
            const snapshot = (0, sharedSession_1.attachShellToSharedSession)(state, options.attachSessionId);
            syncSaveBaselineFromSnapshot(state, snapshot);
            pushTimelineAssistantEntry(view, [
                `attached session ${snapshot.sessionId}`,
                `source ${getReadySourceLabel(state) ?? (0, cliShellConfig_1.quoteForPreview)(snapshot.workingUrdfPath)}`,
                "next /visualize /analyze /health /validate or paste another source",
            ], "info");
        }
        catch (error) {
            view.notice = {
                kind: "warning",
                text: error instanceof Error ? error.message : String(error),
            };
        }
    }
    else if (!options.initialSlashCommand) {
        startStartupResumeCheck(state, (snapshot) => {
            view.notice = {
                kind: "info",
                text: `resume ${snapshot.sessionId} or press Esc to start fresh`,
            };
        });
    }
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
        if (state.repoIntentPrompt || state.candidatePicker || state.session?.pending) {
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
    const openVisualizerInTty = async () => {
        const result = await runBusyOperationAsync({
            title: "visualizer",
            lines: ["starting URDF Studio if needed...", "opening the current session..."],
        }, () => (0, sharedSession_1.openVisualizerForShellState)(state));
        seedSaveBaselineFromCurrentSharedSessionIfUnset(state);
        view.notice = result.notice;
        view.output = result.panel;
    };
    const stopVisualizerInTty = async () => {
        const result = await runBusyOperationAsync({
            title: "visualizer",
            lines: ["stopping URDF Studio...", "keeping the working session on disk..."],
        }, () => runStopVisualizerAction(state));
        view.notice = result.notice;
        view.output = result.panel;
        return result.panel?.kind === "success";
    };
    const handleRootAction = async (slashCommand) => {
        if (!slashCommand || slashCommand === "help") {
            setInput("/");
            return true;
        }
        if (getRepoSourceContext(state) && REPO_INTENT_MENU_ENTRIES.some((entry) => entry.name === slashCommand)) {
            const result = runBusyOperation(slashCommand === "gallery"
                ? {
                    title: "gallery",
                    lines: ["generating cards...", "capturing thumbnails in URDF Studio..."],
                }
                : slashCommand === "repo-fixes"
                    ? {
                        title: "repo fixes",
                        lines: ["scanning repo candidates...", "applying shared safe fixes..."],
                    }
                    : {
                        title: "choosing",
                        lines: ["opening the robot picker..."],
                    }, () => runRepoIntentChoice(state, slashCommand));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, `/${slashCommand}`);
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "exit" || slashCommand === "quit") {
            requestTtyClose();
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
        if (slashCommand === "align") {
            const alignSuggestedAction = getAlignOrientationSuggestedAction(state.suggestedAction);
            const busy = alignSuggestedAction
                ? getSuggestedActionBusyState(alignSuggestedAction)
                : {
                    title: "orientation",
                    lines: ["checking orientation...", "aligning the working copy when needed..."],
                };
            const result = runBusyOperation(busy, () => runAlignOrientationAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/align");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "work-one") {
            const result = runBusyOperation({
                title: "choosing",
                lines: ["opening the robot picker..."],
            }, () => runRepoIntentChoice(state, "work-one"));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/work-one");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "gallery") {
            const busy = {
                title: "gallery",
                lines: ["generating cards...", "capturing thumbnails in URDF Studio..."],
            };
            const result = runBusyOperation(busy, () => runRepoBatchAction(state, "gallery"));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/gallery");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "gallery-current") {
            const result = runBusyOperation({
                title: "gallery",
                lines: ["generating the current card...", "capturing the current thumbnail..."],
            }, () => runCurrentGalleryAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/gallery-current");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "repo-fixes") {
            const result = runBusyOperation({
                title: "repo fixes",
                lines: ["reviewing shared repo issues...", "showing what ilu can fix safely..."],
            }, () => previewRepoFixesAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/repo-fixes");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "visualize") {
            await openVisualizerInTty();
            pushTimelineUserEntry(view, "/visualize");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "visualize-stop") {
            await stopVisualizerInTty();
            pushTimelineUserEntry(view, "/visualize-stop");
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
    const handleRootTaskAction = async (slashCommand) => {
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
            requestTtyClose();
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
                text: "nothing is pending here. paste a source or use /",
            };
            pushTimelineUserEntry(view, "/run");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "align") {
            const alignSuggestedAction = getAlignOrientationSuggestedAction(state.suggestedAction);
            const busy = alignSuggestedAction
                ? getSuggestedActionBusyState(alignSuggestedAction)
                : {
                    title: "orientation",
                    lines: ["checking orientation...", "aligning the working copy when needed..."],
                };
            const result = runBusyOperation(busy, () => runAlignOrientationAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/align");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "work-one") {
            const result = runBusyOperation({
                title: "choosing",
                lines: ["opening the robot picker..."],
            }, () => runRepoIntentChoice(state, "work-one"));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/work-one");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "gallery") {
            const result = runBusyOperation({
                title: "gallery",
                lines: ["generating cards...", "capturing thumbnails in URDF Studio..."],
            }, () => runRepoBatchAction(state, "gallery"));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/gallery");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "gallery-current") {
            const result = runBusyOperation({
                title: "gallery",
                lines: ["generating the current card...", "capturing the current thumbnail..."],
            }, () => runCurrentGalleryAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/gallery-current");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "repo-fixes") {
            const result = runBusyOperation({
                title: "repo fixes",
                lines: ["reviewing shared repo issues...", "showing what ilu can fix safely..."],
            }, () => previewRepoFixesAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/repo-fixes");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "visualize") {
            await openVisualizerInTty();
            pushTimelineUserEntry(view, "/visualize");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "visualize-stop") {
            await stopVisualizerInTty();
            pushTimelineUserEntry(view, "/visualize-stop");
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
    const handleSessionAction = async (slashCommand, inlineValue) => {
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
        if (slashCommand === "work-one") {
            const result = runBusyOperation({
                title: "choosing",
                lines: ["opening the robot picker..."],
            }, () => runRepoIntentChoice(state, "work-one"));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/work-one");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "gallery") {
            const result = runBusyOperation({
                title: "gallery",
                lines: ["generating cards...", "capturing thumbnails in URDF Studio..."],
            }, () => runRepoBatchAction(state, "gallery"));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/gallery");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "gallery-current") {
            const result = runBusyOperation({
                title: "gallery",
                lines: ["generating the current card...", "capturing the current thumbnail..."],
            }, () => runCurrentGalleryAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/gallery-current");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "repo-fixes") {
            const result = runBusyOperation({
                title: "repo fixes",
                lines: ["reviewing shared repo issues...", "showing what ilu can fix safely..."],
            }, () => previewRepoFixesAction(state));
            view.notice = result.notice;
            view.output = result.panel;
            pushTimelineUserEntry(view, "/repo-fixes");
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
        if (slashCommand === "visualize") {
            await openVisualizerInTty();
            pushTimelineUserEntry(view, "/visualize");
            archiveAssistantStateToTimeline(view);
            return true;
        }
        if (slashCommand === "visualize-stop") {
            await stopVisualizerInTty();
            pushTimelineUserEntry(view, "/visualize-stop");
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
            requestTtyClose();
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
            if (setSessionValue(state, session, target.key, inlineValue, feedback)) {
                session.pending = null;
                const { automation, preview } = runBusyOperation(getBusyStateForSession(session, target.key), () => applyValueChangeEffects(state, session, target.key));
                if (automation) {
                    view.notice = automation.notice;
                    view.output = automation.panel;
                    if (automation.clearSession) {
                        clearInteractiveFlowState(state);
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
        session.pending = getPendingValuePrompt(state, session, target.key, slashCommand);
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
        if (setSessionValue(state, session, session.pending.key, view.input, feedback)) {
            pushTimelineUserEntry(view, `/${session.pending.slashName}${(0, cliShellConfig_1.formatInlineValue)(view.input)}`);
            const changedKey = session.pending.key;
            session.pending = null;
            const { automation, preview } = runBusyOperation(getBusyStateForSession(session, changedKey), () => applyValueChangeEffects(state, session, changedKey));
            if (automation) {
                view.notice = automation.notice;
                view.output = automation.panel;
                if (automation.clearSession) {
                    clearInteractiveFlowState(state);
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
    const handleEnter = async () => {
        const trimmed = view.input.trim();
        const bangCommand = parseBangInput(trimmed);
        const isSlashInput = shouldTreatAsSlashInput(view.input, state);
        const activeChoicePrompt = syncActivePromptSelection();
        const activeSavePrompt = getActiveSavePrompt(state);
        const activeExitPrompt = activeChoicePrompt?.kind === "exit" ? activeChoicePrompt.prompt : null;
        const activeResumePrompt = getActiveResumePrompt(state);
        if (activeSavePrompt?.phase === "path") {
            if (isSlashInput || bangCommand) {
                view.notice = { kind: "info", text: getSavePathPromptText(activeSavePrompt) };
                setInput("");
                return;
            }
            const submittedPath = view.input.trim();
            const destinationPath = resolveSaveDestinationPath(submittedPath, activeSavePrompt.defaultPath);
            const saveResult = saveWorkingUrdfToDestination(state, destinationPath);
            state.saveBaselineHash = saveResult.savedHash;
            state.saveBaselineUpdatedAt = getCurrentSharedSessionUpdatedAt(state);
            pushTimelineUserEntry(view, submittedPath || (0, cliShellConfig_1.quoteForPreview)(saveResult.destinationPath));
            pushTimelineAssistantEntry(view, [`saved working URDF to ${(0, cliShellConfig_1.quoteForPreview)(saveResult.destinationPath)}`], "success");
            clearSavePrompt(state);
            view.notice = {
                kind: "success",
                text: `saved working URDF to ${(0, cliShellConfig_1.quoteForPreview)(saveResult.destinationPath)}`,
            };
            view.output = null;
            setInput("");
            if (activeSavePrompt.closeAfterSave) {
                continueTtyCloseFlow({ preserveNotice: true });
            }
            return;
        }
        if (activeChoicePrompt?.kind === "save") {
            if (trimmed.length !== 0) {
                view.notice = { kind: "info", text: getSaveDecisionHint("tty") };
                setInput("");
                return;
            }
            await runPromptSelection(view.promptOptionIndex);
            return;
        }
        if (activeExitPrompt) {
            if (trimmed.length !== 0) {
                view.notice = { kind: "info", text: getVisualizerExitDecisionHint(activeExitPrompt) };
                setInput("");
                return;
            }
            await runPromptSelection(view.promptOptionIndex);
            return;
        }
        if (activeResumePrompt &&
            !state.session &&
            !state.rootTask &&
            !state.repoIntentPrompt &&
            !state.candidatePicker &&
            trimmed.length === 0) {
            try {
                const snapshot = acceptResumePrompt(state);
                pushTimelineAssistantEntry(view, [
                    `resumed session ${snapshot.sessionId}`,
                    `source ${getReadySourceLabel(state) ?? (0, cliShellConfig_1.quoteForPreview)(snapshot.workingUrdfPath)}`,
                    "next /visualize /analyze /health /validate or paste another source",
                ], "success");
                view.notice = {
                    kind: "success",
                    text: `resumed session ${snapshot.sessionId}`,
                };
            }
            catch (error) {
                dismissResumePrompt(state);
                view.notice = {
                    kind: "warning",
                    text: error instanceof Error ? error.message : String(error),
                };
            }
            return;
        }
        if (state.updatePrompt &&
            !state.session &&
            !state.rootTask &&
            !state.repoIntentPrompt &&
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
        const activeSuggestedAction = activeChoicePrompt?.kind === "suggested" ? activeChoicePrompt.prompt : null;
        if (activeSuggestedAction && !isSlashInput && !bangCommand) {
            if (trimmed.length !== 0) {
                view.notice = { kind: "info", text: getSuggestedActionDecisionHint(activeSuggestedAction) };
                setInput("");
                return;
            }
            await runPromptSelection(view.promptOptionIndex);
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
        if (state.repoIntentPrompt && !isSlashInput) {
            if (trimmed.length > 0 && inferFreeformRootPlan(state, view.input)) {
                clearRepoIntentPrompt(state);
            }
            else {
                const choice = resolveRepoIntentSelectionInput(state.repoIntentPrompt, view.input);
                if (choice) {
                    pushTimelineUserEntry(view, choice);
                    clearRepoIntentPrompt(state);
                    const result = runBusyOperation(choice === "gallery"
                        ? {
                            title: "gallery",
                            lines: ["selected /gallery", "generating cards...", "capturing thumbnails in URDF Studio..."],
                        }
                        : choice === "repo-fixes"
                            ? {
                                title: "repo fixes",
                                lines: ["selected /repo-fixes", "scanning repo candidates...", "applying shared safe fixes..."],
                            }
                            : {
                                title: "choosing",
                                lines: ["selected /work-one", "opening the robot picker..."],
                            }, () => runRepoIntentChoice(state, choice));
                    view.notice = result.notice;
                    view.output = result.panel;
                    if (result.clearSession) {
                        clearInteractiveFlowState(state);
                    }
                    archiveAssistantStateToTimeline(view);
                }
                else {
                    view.notice = { kind: "warning", text: "pick 1, 2, or 3 to choose the repo action" };
                }
                setInput("");
                return;
            }
        }
        if (state.candidatePicker && !isSlashInput) {
            const selectedPath = resolveCandidateSelectionInput(state, view.input);
            if (selectedPath) {
                const selectedInput = selectedPath === view.input.trim() ? selectedPath : view.input.trim() || selectedPath;
                const picker = state.candidatePicker;
                pushTimelineUserEntry(view, selectedInput);
                (0, cliShellConfig_1.clearCandidatePicker)(state);
                const result = runBusyOperation({
                    title: "loading",
                    lines: [`selected ${(0, cliShellConfig_1.quoteForPreview)(selectedPath)}`, "loading selected entry...", "running validation and health check..."],
                }, () => runSelectedCandidatePicker(state, picker, selectedPath));
                view.notice = result?.notice ?? { kind: "error", text: "could not load candidate" };
                view.output = result?.panel ?? null;
                if (result?.clearSession) {
                    clearInteractiveFlowState(state);
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
                            await handleSessionAction(selected.name, "");
                        }
                        else if (state.rootTask) {
                            await handleRootTaskAction(selected.name);
                        }
                        else {
                            await handleRootAction(selected.name);
                        }
                        syncInputAfterSlashAction({ slashCommand: selected.name, inlineValue: "" });
                        return;
                    }
                }
            }
            if (state.session) {
                await handleSessionAction(parsed.slashCommand, parsed.inlineValue);
            }
            else if (state.rootTask) {
                await handleRootTaskAction(parsed.slashCommand);
            }
            else {
                await handleRootAction(parsed.slashCommand);
            }
            syncInputAfterSlashAction(parsed);
            return;
        }
        if (trimmed.length === 0) {
            if (state.session && !state.session.pending && getRequirementStatus(state.session).ready) {
                await handleSessionAction("run", "");
                return;
            }
            if (state.repoIntentPrompt) {
                const result = runBusyOperation({
                    title: "choosing",
                    lines: ["opening the robot picker..."],
                }, () => runRepoIntentChoice(state, "work-one"));
                view.notice = result.notice;
                view.output = result.panel;
                archiveAssistantStateToTimeline(view);
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
            const applied = applyFreeformInputToSession(state, state.session, view.input, feedback);
            if (applied) {
                const automated = runBusyOperation(getBusyStateForSession(applied.session, applied.key), () => runDirectInputAutomation(state, applied.session, applied.key));
                if (automated) {
                    view.notice = automated.notice;
                    view.output = automated.panel;
                    if (automated.clearSession) {
                        clearInteractiveFlowState(state);
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
                        clearInteractiveFlowState(state);
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
        view.notice = { kind: "info", text: "paste repo or local path  / for actions" };
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
    const runBusyOperationAsync = async (busy, operation) => {
        setInput("");
        view.busy = busy;
        queueRender("force");
        try {
            return await operation();
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
            await handleRootAction(parsed.slashCommand);
        }
    }
    startStartupUpdateCheck(state, () => {
        if (closed ||
            view.input.length > 0 ||
            view.timeline.length > 0 ||
            state.session ||
            state.rootTask ||
            state.repoIntentPrompt ||
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
        const activeChoicePrompt = syncActivePromptSelection();
        const activeSavePrompt = getActiveSavePrompt(state);
        const activeExitPrompt = activeChoicePrompt?.kind === "exit" ? activeChoicePrompt.prompt : null;
        const activeSuggestedAction = activeChoicePrompt?.kind === "suggested" ? activeChoicePrompt.prompt : null;
        if ((key.ctrl && key.name === "c") || input === "\u0003") {
            if (activeSavePrompt?.phase === "path") {
                state.savePrompt = {
                    ...activeSavePrompt,
                    phase: "confirm",
                };
                setInput("");
                view.notice = { kind: "info", text: "save path cancelled" };
                queueRender("force");
                return;
            }
            if (activeChoicePrompt?.kind === "save") {
                void runPromptSelection(view.promptOptionIndex)
                    .then(() => {
                    queueRender("force");
                })
                    .catch((error) => {
                    view.busy = null;
                    ignoreKeypressUntilMs = Date.now() + 200;
                    view.notice = {
                        kind: "error",
                        text: error instanceof Error ? error.message : String(error),
                    };
                    queueRender("force");
                });
                return;
            }
            if (activeExitPrompt) {
                void runPromptSelection(view.promptOptionIndex)
                    .then(() => {
                    queueRender("force");
                })
                    .catch((error) => {
                    view.busy = null;
                    ignoreKeypressUntilMs = Date.now() + 200;
                    view.notice = {
                        kind: "error",
                        text: error instanceof Error ? error.message : String(error),
                    };
                    queueRender("force");
                });
            }
            else {
                requestTtyClose();
                queueRender("force");
            }
            return;
        }
        if (key.name === "return" || key.name === "enter") {
            void handleEnter()
                .then(() => {
                queueRender("force");
            })
                .catch((error) => {
                view.busy = null;
                ignoreKeypressUntilMs = Date.now() + 200;
                view.notice = {
                    kind: "error",
                    text: error instanceof Error ? error.message : String(error),
                };
                queueRender("force");
            });
            return;
        }
        if (key.name === "up" || (key.shift && key.name === "tab")) {
            if (activeChoicePrompt && view.input.length === 0) {
                setPromptOptionIndex(view.promptOptionIndex - 1);
                queueRender("navigation");
                return;
            }
            if (state.repoIntentPrompt && !view.input.startsWith("/")) {
                state.repoIntentPrompt.selectedIndex = (0, cliShellConfig_1.clamp)(state.repoIntentPrompt.selectedIndex - 1, 0, getRepoIntentMenuEntries().length - 1);
                queueRender("navigation");
                return;
            }
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
            if (activeChoicePrompt && view.input.length === 0) {
                setPromptOptionIndex(view.promptOptionIndex + 1);
                queueRender("navigation");
                return;
            }
            if (state.repoIntentPrompt && !view.input.startsWith("/")) {
                state.repoIntentPrompt.selectedIndex = (0, cliShellConfig_1.clamp)(state.repoIntentPrompt.selectedIndex + 1, 0, getRepoIntentMenuEntries().length - 1);
                queueRender("navigation");
                return;
            }
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
            if (activeSavePrompt?.phase === "path") {
                state.savePrompt = {
                    ...activeSavePrompt,
                    phase: "confirm",
                };
                setInput("");
                view.notice = { kind: "info", text: "save path cancelled" };
                queueRender("navigation");
                return;
            }
            if (activeChoicePrompt && view.input.length === 0) {
                void runPromptSelection(1)
                    .then(() => {
                    queueRender("force");
                })
                    .catch((error) => {
                    view.busy = null;
                    ignoreKeypressUntilMs = Date.now() + 200;
                    view.notice = {
                        kind: "error",
                        text: error instanceof Error ? error.message : String(error),
                    };
                    queueRender("force");
                });
                return;
            }
            if (state.resumePrompt && view.input.length === 0 && !state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker) {
                dismissResumePrompt(state);
                view.notice = { kind: "info", text: "starting fresh" };
                queueRender("navigation");
                return;
            }
            if (state.updatePrompt && view.input.length === 0 && !state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker) {
                (0, cliShellConfig_1.dismissUpdatePrompt)(state);
                queueRender("navigation");
                return;
            }
            if (state.repoIntentPrompt && view.input.length === 0) {
                clearRepoIntentPrompt(state);
                view.notice = { kind: "info", text: "repo action cancelled" };
                queueRender("navigation");
                return;
            }
            if (activeSuggestedAction && view.input.length === 0) {
                view.notice = skipSuggestedAction(state, activeSuggestedAction);
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
        if (activeChoicePrompt &&
            view.input.length === 0 &&
            !key.ctrl &&
            !key.meta &&
            (input.toLowerCase() === "k" || input.toLowerCase() === "j")) {
            setPromptOptionIndex(view.promptOptionIndex + (input.toLowerCase() === "j" ? 1 : -1));
            queueRender("navigation");
            return;
        }
        if (activeChoicePrompt && view.input.length === 0 && !key.ctrl && !key.meta) {
            const shortcutSelection = resolvePromptShortcutSelection(input);
            if (shortcutSelection !== null) {
                void runPromptSelection(shortcutSelection)
                    .then(() => {
                    queueRender("force");
                })
                    .catch((error) => {
                    view.busy = null;
                    ignoreKeypressUntilMs = Date.now() + 200;
                    view.notice = {
                        kind: "error",
                        text: error instanceof Error ? error.message : String(error),
                    };
                    queueRender("force");
                });
                return;
            }
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
            if (activeExitPrompt) {
                view.notice = { kind: "info", text: getVisualizerExitDecisionHint(activeExitPrompt) };
                queueRender("navigation");
                return;
            }
            if (state.resumePrompt && !state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker && view.input.length === 0) {
                dismissResumePrompt(state);
            }
            if (state.updatePrompt && !state.session && !state.rootTask && !state.repoIntentPrompt && !state.candidatePicker && view.input.length === 0) {
                (0, cliShellConfig_1.dismissUpdatePrompt)(state);
            }
            if (state.repoIntentPrompt && view.input.length === 0 && input === "/") {
                clearRepoIntentPrompt(state);
            }
            if (activeSuggestedAction) {
                const isBypassingSuggestedAction = input === "/" ||
                    input === "!" ||
                    view.input.startsWith("/") ||
                    view.input.startsWith("!");
                if (isBypassingSuggestedAction) {
                    bypassSuggestedAction(state, activeSuggestedAction);
                    setInput(`${view.input}${input}`);
                    if (view.input.startsWith("/")) {
                        view.menuIndex = 0;
                    }
                    view.notice = null;
                    queueRender("typing");
                    return;
                }
                view.notice = { kind: "info", text: getSuggestedActionDecisionHint(activeSuggestedAction) };
                queueRender("navigation");
                return;
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
        visualizerExitGuard.dispose();
        printTtyShellSnapshot(state, view);
    }
};
const renderShellHelp = () => {
    return [
        "Start the i<3urdf interactive shell.",
        "",
        "Usage",
        "  ilu",
        "  ilu resume",
        "  ilu shell",
        "  ilu attach <session-id>",
        "",
        "Inside the shell",
        "  owner/repo         Load a GitHub repo and auto-run checks",
        "  ./robot.urdf       Run validation and a health check",
        "  ./robot.zip        Unpack and check an uploaded archive",
        "  ./robot-folder/    Load a local repo or folder and auto-run checks",
        "  resume prompt      Reopen the last session with Enter or skip with Esc",
        "  update prompt      If a newer release exists, Enter updates and Esc skips",
        "  exit prompt        If the working copy changed, ilu asks where to save it before quitting",
        "  !xacro            Install or verify the local XACRO runtime",
        "  /                  Open direct actions under the prompt",
        "  up/down, j/k       Move through picker and prompt options",
        "  1/2                Pick the first or second prompt option directly",
        "  tab                Complete the selected option or path",
        "  enter              Select the highlighted option, run the ready action, or accept a recommended fix",
        "  ctrl+c             Exit, or confirm the current URDF Studio exit option when it is open",
        "  esc                Pick the secondary prompt option, close the picker, or cancel a pending value",
        "  /open              Load a repo, folder, or file as the current source",
        "  /inspect           Preview a repo or folder and suggest an entrypoint",
        "  /analyze           Run the compact investigation view",
        "  /health            Run the main health check",
        "  /validate          Validate URDF structure and required tags",
        "  /orientation       Check the current orientation and suggest a safe fix",
        "  /align             Apply the recommended orientation fix to the loaded source",
        "  /visualize         Open the current shared session in URDF Studio",
        "  /visualize-stop    Stop the local URDF Studio started by ilu",
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

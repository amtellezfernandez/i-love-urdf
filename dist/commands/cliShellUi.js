"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printRootQuickStart = exports.printCommandList = exports.printContextRows = exports.renderContextRow = exports.renderContextValue = exports.printRepoIntentPrompt = exports.printCandidatePicker = exports.printOutputPanel = exports.printSectionTitle = exports.renderPanelLine = exports.getPanelLineIcon = exports.createOutputPanel = void 0;
const process = require("node:process");
const cliShellConfig_1 = require("./cliShellConfig");
const cliShellRecommendations_1 = require("./cliShellRecommendations");
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
exports.createOutputPanel = createOutputPanel;
const getPanelLineIcon = (line) => {
    const normalized = (0, cliShellConfig_1.stripAnsi)(line).trim().toLowerCase();
    if (normalized === "looks ready" ||
        normalized === "no obvious problems found" ||
        normalized.startsWith("repaired ") ||
        normalized === "working copy ready" ||
        normalized.startsWith("validation passed") ||
        normalized.startsWith("health check passed")) {
        return "✓";
    }
    if (normalized.startsWith("best next step") ||
        normalized.startsWith("recommended:") ||
        normalized.startsWith("then /") ||
        normalized.startsWith("next /")) {
        return "→";
    }
    if (normalized.startsWith("validation found") ||
        normalized.startsWith("health check found") ||
        normalized.startsWith("error ")) {
        return "!";
    }
    if (normalized.startsWith("warning ")) {
        return "!";
    }
    return "•";
};
exports.getPanelLineIcon = getPanelLineIcon;
const renderPanelLine = (line, kind) => {
    const renderText = kind === "error" ? cliShellConfig_1.SHELL_THEME.error : cliShellConfig_1.SHELL_THEME.muted;
    return `${cliShellConfig_1.SHELL_THEME.icon((0, exports.getPanelLineIcon)(line))} ${renderText(line)}`;
};
exports.renderPanelLine = renderPanelLine;
const printSectionTitle = (title) => {
    process.stdout.write(`\n${cliShellConfig_1.SHELL_THEME.section(title)}\n`);
};
exports.printSectionTitle = printSectionTitle;
const printOutputPanel = (panel) => {
    if (!panel) {
        return;
    }
    (0, exports.printSectionTitle)(panel.title);
    for (const line of panel.lines) {
        process.stdout.write(`  ${(0, exports.renderPanelLine)(line, panel.kind)}\n`);
    }
};
exports.printOutputPanel = printOutputPanel;
const printCandidatePicker = (picker) => {
    (0, exports.printSectionTitle)("choose");
    process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.muted("type a number, press Enter for the highlighted match, or paste a repo entry path")}\n`);
    for (const [index, candidate] of picker.candidates.slice(0, 9).entries()) {
        const prefix = index === picker.selectedIndex ? cliShellConfig_1.SHELL_THEME.accent(">") : cliShellConfig_1.SHELL_THEME.muted(`${index + 1}.`);
        const details = (0, cliShellRecommendations_1.getCandidateDetails)(candidate);
        process.stdout.write(`  ${prefix} ${cliShellConfig_1.SHELL_THEME.command(candidate.path)}${details.length > 0 ? `  ${cliShellConfig_1.SHELL_THEME.muted(details.join("  "))}` : ""}\n`);
    }
    if (picker.candidates.length > 9) {
        process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.muted(`+${picker.candidates.length - 9} more`)}\n`);
    }
};
exports.printCandidatePicker = printCandidatePicker;
const printRepoIntentPrompt = (prompt, entries) => {
    (0, exports.printSectionTitle)("next");
    process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.muted(`found ${prompt.payload.candidateCount} robots. choose what to do with this repo.`)}\n`);
    for (const [index, entry] of entries.entries()) {
        const prefix = index === prompt.selectedIndex ? cliShellConfig_1.SHELL_THEME.accent(">") : cliShellConfig_1.SHELL_THEME.muted(`${index + 1}.`);
        process.stdout.write(`  ${prefix} ${cliShellConfig_1.SHELL_THEME.command(entry.name)}  ${cliShellConfig_1.SHELL_THEME.muted(entry.summary)}\n`);
    }
};
exports.printRepoIntentPrompt = printRepoIntentPrompt;
const renderContextValue = (row) => {
    switch (row.tone) {
        case "accent":
            return cliShellConfig_1.SHELL_THEME.accent(row.value);
        case "muted":
            return cliShellConfig_1.SHELL_THEME.muted(row.value);
        default:
            return cliShellConfig_1.SHELL_THEME.command(row.value);
    }
};
exports.renderContextValue = renderContextValue;
const renderContextRow = (row) => `  ${cliShellConfig_1.SHELL_THEME.muted(row.label.padEnd(12))} ${(0, exports.renderContextValue)(row)}`;
exports.renderContextRow = renderContextRow;
const printContextRows = (rows) => {
    for (const row of rows) {
        process.stdout.write(`${(0, exports.renderContextRow)(row)}\n`);
    }
};
exports.printContextRows = printContextRows;
const printCommandList = (entries, prefix = "/", includeSummary = true) => {
    for (const entry of entries) {
        const label = `${prefix}${entry.name}`;
        if (!includeSummary || !entry.summary) {
            process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.command(label)}\n`);
            continue;
        }
        process.stdout.write(`  ${cliShellConfig_1.SHELL_THEME.command(label.padEnd(18))} ${cliShellConfig_1.SHELL_THEME.muted(entry.summary)}\n`);
    }
};
exports.printCommandList = printCommandList;
const printRootQuickStart = () => {
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.brand(cliShellConfig_1.SHELL_BRAND)} ${cliShellConfig_1.SHELL_THEME.muted("urdf shell")}\n`);
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(cliShellConfig_1.ROOT_GUIDANCE)}\n`);
};
exports.printRootQuickStart = printRootQuickStart;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTtyRepoIntentChoice = exports.handleTtySelectedRepoIntentChoice = exports.handleLineShellSelectedRepoIntentChoice = exports.getRepoIntentChoiceBusyState = void 0;
const cliShellConfig_1 = require("./cliShellConfig");
const cliShellUi_1 = require("./cliShellUi");
const getRepoIntentChoiceBusyState = (choice) => choice === "gallery"
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
        };
exports.getRepoIntentChoiceBusyState = getRepoIntentChoiceBusyState;
const getSelectedRepoIntentChoice = (prompt, getRepoIntentMenuEntries, clamp) => (getRepoIntentMenuEntries()[clamp(prompt.selectedIndex, 0, getRepoIntentMenuEntries().length - 1)]
    ?.name ?? "work-one");
const executeSelectedRepoIntentChoice = (state, deps) => {
    if (!state.repoIntentPrompt) {
        return null;
    }
    const choice = getSelectedRepoIntentChoice(state.repoIntentPrompt, deps.getRepoIntentMenuEntries, deps.clamp);
    return {
        choice,
        result: deps.runRepoIntentChoice(state, choice),
    };
};
const handleLineShellSelectedRepoIntentChoice = async (state, deps) => {
    const execution = executeSelectedRepoIntentChoice(state, deps);
    if (!execution) {
        return false;
    }
    process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted((0, exports.getRepoIntentChoiceBusyState)(execution.choice).lines[0])}\n`);
    if (execution.result.notice) {
        (0, cliShellConfig_1.writeFeedback)(execution.result.notice);
    }
    (0, cliShellUi_1.printOutputPanel)(execution.result.panel);
    if (state.repoIntentPrompt) {
        (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, deps.getRepoIntentMenuEntries());
    }
    else if (state.candidatePicker) {
        (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
    }
    return true;
};
exports.handleLineShellSelectedRepoIntentChoice = handleLineShellSelectedRepoIntentChoice;
const handleTtySelectedRepoIntentChoice = (state, view, deps) => {
    const execution = executeSelectedRepoIntentChoice(state, deps);
    if (!execution) {
        return false;
    }
    const result = deps.runBusy((0, exports.getRepoIntentChoiceBusyState)(execution.choice), () => execution.result);
    view.notice = result.notice;
    view.output = result.panel;
    deps.pushTimelineUserEntry(view, "/run");
    deps.archiveAssistantStateToTimeline(view);
    return true;
};
exports.handleTtySelectedRepoIntentChoice = handleTtySelectedRepoIntentChoice;
const handleTtyRepoIntentChoice = (state, view, choice, deps) => {
    const result = deps.runBusy((0, exports.getRepoIntentChoiceBusyState)(choice), () => deps.runRepoIntentChoice(state, choice));
    view.notice = result.notice;
    view.output = result.panel;
    deps.pushTimelineUserEntry(view, deps.commandLabel);
    deps.archiveAssistantStateToTimeline(view);
    return true;
};
exports.handleTtyRepoIntentChoice = handleTtyRepoIntentChoice;

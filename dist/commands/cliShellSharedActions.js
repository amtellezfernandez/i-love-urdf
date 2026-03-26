"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCommonTtyCommand = exports.handleCommonLineShellCommand = void 0;
const cliUpdate_1 = require("./cliUpdate");
const cliShellConfig_1 = require("./cliShellConfig");
const cliShellUi_1 = require("./cliShellUi");
const handleCommonLineShellCommand = async (slashCommand, state, deps) => {
    if (slashCommand === "exit" || slashCommand === "quit") {
        deps.close();
        return true;
    }
    if (slashCommand === "clear") {
        console.clear();
        return true;
    }
    if (slashCommand === "update") {
        (0, cliUpdate_1.runUpdateCommand)();
        return true;
    }
    if (slashCommand === "doctor") {
        const result = deps.runDoctorShellCommand();
        (0, cliShellConfig_1.writeFeedback)(result.notice);
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return true;
    }
    if (slashCommand === "last") {
        deps.printLastUrdf(state);
        return true;
    }
    if (slashCommand === "align") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted(deps.getAlignBusyLine(state))}\n`);
        const result = deps.runAlignOrientationAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return true;
    }
    if (slashCommand === "work-one") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("opening the robot picker...")}\n`);
        const result = deps.runRepoIntentChoice(state, "work-one");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.candidatePicker) {
            (0, cliShellUi_1.printCandidatePicker)(state.candidatePicker);
        }
        return true;
    }
    if (slashCommand === "gallery") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating cards and thumbnails...")}\n`);
        const result = await deps.runRepoBatchAction(state, "gallery");
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, deps.getRepoIntentMenuEntries());
        }
        return true;
    }
    if (slashCommand === "gallery-current") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("generating the current gallery assets...")}\n`);
        const result = deps.runCurrentGalleryAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        return true;
    }
    if (slashCommand === "repo-fixes") {
        process.stdout.write(`${cliShellConfig_1.SHELL_THEME.muted("reviewing shared repo issues...")}\n`);
        const result = deps.previewRepoFixesAction(state);
        if (result.notice) {
            (0, cliShellConfig_1.writeFeedback)(result.notice);
        }
        (0, cliShellUi_1.printOutputPanel)(result.panel);
        if (state.repoIntentPrompt) {
            (0, cliShellUi_1.printRepoIntentPrompt)(state.repoIntentPrompt, deps.getRepoIntentMenuEntries());
        }
        return true;
    }
    if (slashCommand === "visualize") {
        await deps.printVisualizerShellAction(state);
        return true;
    }
    if (slashCommand === "visualize-stop") {
        await deps.printVisualizerStopShellAction(state);
        return true;
    }
    return false;
};
exports.handleCommonLineShellCommand = handleCommonLineShellCommand;
const handleCommonTtyCommand = async (slashCommand, state, view, deps) => {
    if (slashCommand === "exit" || slashCommand === "quit") {
        deps.requestClose();
        return true;
    }
    if (slashCommand === "clear") {
        view.timeline = [];
        view.notice = null;
        view.output = null;
        return true;
    }
    if (slashCommand === "last") {
        view.notice = { kind: "info", text: deps.getLastUrdfMessage(state) };
        deps.pushTimelineUserEntry(view, "/last");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "align") {
        const result = deps.runBusyOperation(deps.getAlignBusyState(state), () => deps.runAlignOrientationAction(state));
        view.notice = result.notice;
        view.output = result.panel;
        deps.pushTimelineUserEntry(view, "/align");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "work-one") {
        const result = deps.runBusyOperation({
            title: "choosing",
            lines: ["opening the robot picker..."],
        }, () => deps.runRepoIntentChoice(state, "work-one"));
        view.notice = result.notice;
        view.output = result.panel;
        deps.pushTimelineUserEntry(view, "/work-one");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "gallery") {
        const result = deps.runBusyOperation({
            title: "gallery",
            lines: ["generating cards...", "capturing thumbnails in URDF Studio..."],
        }, () => deps.runRepoBatchAction(state, "gallery"));
        view.notice = result.notice;
        view.output = result.panel;
        deps.pushTimelineUserEntry(view, "/gallery");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "gallery-current") {
        const result = deps.runBusyOperation({
            title: "gallery",
            lines: ["generating the current card...", "capturing the current thumbnail..."],
        }, () => deps.runCurrentGalleryAction(state));
        view.notice = result.notice;
        view.output = result.panel;
        deps.pushTimelineUserEntry(view, "/gallery-current");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "repo-fixes") {
        const result = deps.runBusyOperation({
            title: "repo fixes",
            lines: ["reviewing shared repo issues...", "showing what ilu can fix safely..."],
        }, () => deps.previewRepoFixesAction(state));
        view.notice = result.notice;
        view.output = result.panel;
        deps.pushTimelineUserEntry(view, "/repo-fixes");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "visualize") {
        await deps.openVisualizer();
        deps.pushTimelineUserEntry(view, "/visualize");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "visualize-stop") {
        await deps.stopVisualizer();
        deps.pushTimelineUserEntry(view, "/visualize-stop");
        deps.archiveAssistantStateToTimeline(view);
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
        deps.pushTimelineUserEntry(view, "/update");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    if (slashCommand === "doctor") {
        const result = deps.runDoctorShellCommand();
        view.notice = result.notice;
        view.output = result.panel;
        deps.pushTimelineUserEntry(view, "/doctor");
        deps.archiveAssistantStateToTimeline(view);
        return true;
    }
    return false;
};
exports.handleCommonTtyCommand = handleCommonTtyCommand;

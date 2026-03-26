import type { AutoAutomationResult, RepoIntentChoiceName, ShellFeedback, ShellOutputPanel, ShellState, TtyMenuEntry, TtyShellViewState } from "./cliShellTypes";
type LineActionDeps = {
    close: () => void;
    runDoctorShellCommand: () => {
        notice: ShellFeedback;
        panel: ShellOutputPanel;
    };
    printLastUrdf: (state: ShellState) => void;
    getAlignBusyLine: (state: ShellState) => string;
    runAlignOrientationAction: (state: ShellState) => AutoAutomationResult;
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
    runRepoBatchAction: (state: ShellState, mode: "gallery") => AutoAutomationResult | Promise<AutoAutomationResult>;
    previewRepoFixesAction: (state: ShellState) => AutoAutomationResult;
    runCurrentGalleryAction: (state: ShellState) => AutoAutomationResult;
    printVisualizerShellAction: (state: ShellState) => Promise<void>;
    printVisualizerStopShellAction: (state: ShellState) => Promise<void>;
    getRepoIntentMenuEntries: () => readonly TtyMenuEntry[];
};
type TtyActionDeps = {
    requestClose: () => void;
    runBusyOperation: <T>(busy: {
        title: string;
        lines: readonly string[];
    }, operation: () => T) => T;
    openVisualizer: () => Promise<void>;
    stopVisualizer: () => Promise<boolean>;
    runDoctorShellCommand: () => {
        notice: ShellFeedback;
        panel: TtyShellViewState["output"];
    };
    getLastUrdfMessage: (state: ShellState) => string;
    pushTimelineUserEntry: (view: TtyShellViewState, line: string) => void;
    archiveAssistantStateToTimeline: (view: TtyShellViewState, options?: {
        clear?: boolean;
        fallbackText?: string;
    }) => void;
    getAlignBusyState: (state: ShellState) => {
        title: string;
        lines: readonly string[];
    };
    runAlignOrientationAction: (state: ShellState) => AutoAutomationResult;
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
    runRepoBatchAction: (state: ShellState, mode: "gallery") => AutoAutomationResult;
    previewRepoFixesAction: (state: ShellState) => AutoAutomationResult;
    runCurrentGalleryAction: (state: ShellState) => AutoAutomationResult;
};
export declare const handleCommonLineShellCommand: (slashCommand: string, state: ShellState, deps: LineActionDeps) => Promise<boolean>;
export declare const handleCommonTtyCommand: (slashCommand: string, state: ShellState, view: TtyShellViewState, deps: TtyActionDeps) => Promise<boolean>;
export {};

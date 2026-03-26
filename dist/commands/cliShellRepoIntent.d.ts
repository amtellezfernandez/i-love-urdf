import type { AutoAutomationResult, RepoIntentChoiceName, ShellState, TtyMenuEntry, TtyShellViewState } from "./cliShellTypes";
export declare const getRepoIntentChoiceBusyState: (choice: RepoIntentChoiceName) => {
    title: string;
    lines: string[];
};
export declare const handleLineShellSelectedRepoIntentChoice: (state: ShellState, deps: {
    getRepoIntentMenuEntries: () => readonly TtyMenuEntry[];
    clamp: (value: number, min: number, max: number) => number;
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
}) => Promise<boolean>;
export declare const handleTtySelectedRepoIntentChoice: (state: ShellState, view: TtyShellViewState, deps: {
    getRepoIntentMenuEntries: () => readonly TtyMenuEntry[];
    clamp: (value: number, min: number, max: number) => number;
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
    runBusy: (busy: {
        title: string;
        lines: readonly string[];
    }, operation: () => AutoAutomationResult) => AutoAutomationResult;
    pushTimelineUserEntry: (view: TtyShellViewState, line: string) => void;
    archiveAssistantStateToTimeline: (view: TtyShellViewState) => void;
}) => boolean;
export declare const handleTtyRepoIntentChoice: (state: ShellState, view: TtyShellViewState, choice: RepoIntentChoiceName, deps: {
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
    runBusy: (busy: {
        title: string;
        lines: readonly string[];
    }, operation: () => AutoAutomationResult) => AutoAutomationResult;
    commandLabel: string;
    pushTimelineUserEntry: (view: TtyShellViewState, line: string) => void;
    archiveAssistantStateToTimeline: (view: TtyShellViewState) => void;
}) => boolean;

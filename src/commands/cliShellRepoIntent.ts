import { SHELL_THEME, writeFeedback } from "./cliShellConfig";
import type {
  AutoAutomationResult,
  RepoIntentChoiceName,
  RepoIntentPromptState,
  ShellState,
  TtyMenuEntry,
  TtyShellViewState,
} from "./cliShellTypes";
import { printCandidatePicker, printOutputPanel, printRepoIntentPrompt } from "./cliShellUi";

export const getRepoIntentChoiceBusyState = (
  choice: RepoIntentChoiceName
): {
  title: string;
  lines: string[];
} =>
  choice === "gallery"
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

const getSelectedRepoIntentChoice = (
  prompt: RepoIntentPromptState,
  getRepoIntentMenuEntries: () => readonly TtyMenuEntry[],
  clamp: (value: number, min: number, max: number) => number
): RepoIntentChoiceName =>
  (getRepoIntentMenuEntries()[clamp(prompt.selectedIndex, 0, getRepoIntentMenuEntries().length - 1)]
    ?.name ?? "work-one") as RepoIntentChoiceName;

const executeSelectedRepoIntentChoice = (
  state: Pick<ShellState, "repoIntentPrompt" | "repoSourceContext" | "candidatePicker" | "session" | "rootTask" | "loadedSource">,
  deps: {
    getRepoIntentMenuEntries: () => readonly TtyMenuEntry[];
    clamp: (value: number, min: number, max: number) => number;
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
  }
): { choice: RepoIntentChoiceName; result: AutoAutomationResult } | null => {
  if (!state.repoIntentPrompt) {
    return null;
  }

  const choice = getSelectedRepoIntentChoice(state.repoIntentPrompt, deps.getRepoIntentMenuEntries, deps.clamp);
  return {
    choice,
    result: deps.runRepoIntentChoice(state as ShellState, choice),
  };
};

export const handleLineShellSelectedRepoIntentChoice = async (
  state: ShellState,
  deps: {
    getRepoIntentMenuEntries: () => readonly TtyMenuEntry[];
    clamp: (value: number, min: number, max: number) => number;
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
  }
): Promise<boolean> => {
  const execution = executeSelectedRepoIntentChoice(state, deps);
  if (!execution) {
    return false;
  }

  process.stdout.write(`${SHELL_THEME.muted(getRepoIntentChoiceBusyState(execution.choice).lines[0])}\n`);
  if (execution.result.notice) {
    writeFeedback(execution.result.notice);
  }
  printOutputPanel(execution.result.panel);
  if (state.repoIntentPrompt) {
    printRepoIntentPrompt(state.repoIntentPrompt, deps.getRepoIntentMenuEntries());
  } else if (state.candidatePicker) {
    printCandidatePicker(state.candidatePicker);
  }
  return true;
};

export const handleTtySelectedRepoIntentChoice = (
  state: ShellState,
  view: TtyShellViewState,
  deps: {
    getRepoIntentMenuEntries: () => readonly TtyMenuEntry[];
    clamp: (value: number, min: number, max: number) => number;
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
    runBusy: (
      busy: { title: string; lines: readonly string[] },
      operation: () => AutoAutomationResult
    ) => AutoAutomationResult;
    pushTimelineUserEntry: (view: TtyShellViewState, line: string) => void;
    archiveAssistantStateToTimeline: (view: TtyShellViewState) => void;
  }
): boolean => {
  const execution = executeSelectedRepoIntentChoice(state, deps);
  if (!execution) {
    return false;
  }

  const result = deps.runBusy(getRepoIntentChoiceBusyState(execution.choice), () => execution.result);
  view.notice = result.notice;
  view.output = result.panel;
  deps.pushTimelineUserEntry(view, "/run");
  deps.archiveAssistantStateToTimeline(view);
  return true;
};

export const handleTtyRepoIntentChoice = (
  state: ShellState,
  view: TtyShellViewState,
  choice: RepoIntentChoiceName,
  deps: {
    runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
    runBusy: (
      busy: { title: string; lines: readonly string[] },
      operation: () => AutoAutomationResult
    ) => AutoAutomationResult;
    commandLabel: string;
    pushTimelineUserEntry: (view: TtyShellViewState, line: string) => void;
    archiveAssistantStateToTimeline: (view: TtyShellViewState) => void;
  }
): boolean => {
  const result = deps.runBusy(getRepoIntentChoiceBusyState(choice), () => deps.runRepoIntentChoice(state, choice));
  view.notice = result.notice;
  view.output = result.panel;
  deps.pushTimelineUserEntry(view, deps.commandLabel);
  deps.archiveAssistantStateToTimeline(view);
  return true;
};

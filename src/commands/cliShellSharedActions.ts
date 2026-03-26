import { runUpdateCommand } from "./cliUpdate";
import { dismissUpdatePrompt, SHELL_THEME, writeFeedback } from "./cliShellConfig";
import type {
  AutoAutomationResult,
  RepoIntentChoiceName,
  ShellFeedback,
  ShellOutputPanel,
  ShellState,
  TtyMenuEntry,
  TtyShellViewState,
} from "./cliShellTypes";
import { printCandidatePicker, printOutputPanel, printRepoIntentPrompt } from "./cliShellUi";

type LineActionDeps = {
  close: () => void;
  runDoctorShellCommand: () => { notice: ShellFeedback; panel: ShellOutputPanel };
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
  runBusyOperation: <T>(
    busy: {
      title: string;
      lines: readonly string[];
    },
    operation: () => T
  ) => T;
  openVisualizer: () => Promise<void>;
  stopVisualizer: () => Promise<boolean>;
  runDoctorShellCommand: () => { notice: ShellFeedback; panel: TtyShellViewState["output"] };
  getLastUrdfMessage: (state: ShellState) => string;
  pushTimelineUserEntry: (view: TtyShellViewState, line: string) => void;
  archiveAssistantStateToTimeline: (
    view: TtyShellViewState,
    options?: {
      clear?: boolean;
      fallbackText?: string;
    }
  ) => void;
  getAlignBusyState: (state: ShellState) => { title: string; lines: readonly string[] };
  runAlignOrientationAction: (state: ShellState) => AutoAutomationResult;
  runRepoIntentChoice: (state: ShellState, choice: RepoIntentChoiceName) => AutoAutomationResult;
  runRepoBatchAction: (state: ShellState, mode: "gallery") => AutoAutomationResult;
  previewRepoFixesAction: (state: ShellState) => AutoAutomationResult;
  runCurrentGalleryAction: (state: ShellState) => AutoAutomationResult;
};

export const handleCommonLineShellCommand = async (
  slashCommand: string,
  state: ShellState,
  deps: LineActionDeps
): Promise<boolean> => {
  if (slashCommand === "exit" || slashCommand === "quit") {
    deps.close();
    return true;
  }

  if (slashCommand === "clear") {
    console.clear();
    return true;
  }

  if (slashCommand === "update") {
    runUpdateCommand();
    return true;
  }

  if (slashCommand === "doctor") {
    const result = deps.runDoctorShellCommand();
    writeFeedback(result.notice);
    printOutputPanel(result.panel);
    return true;
  }

  if (slashCommand === "last") {
    deps.printLastUrdf(state);
    return true;
  }

  if (slashCommand === "align") {
    process.stdout.write(`${SHELL_THEME.muted(deps.getAlignBusyLine(state))}\n`);
    const result = deps.runAlignOrientationAction(state);
    if (result.notice) {
      writeFeedback(result.notice);
    }
    printOutputPanel(result.panel);
    return true;
  }

  if (slashCommand === "work-one") {
    process.stdout.write(`${SHELL_THEME.muted("opening the robot picker...")}\n`);
    const result = deps.runRepoIntentChoice(state, "work-one");
    if (result.notice) {
      writeFeedback(result.notice);
    }
    printOutputPanel(result.panel);
    if (state.candidatePicker) {
      printCandidatePicker(state.candidatePicker);
    }
    return true;
  }

  if (slashCommand === "gallery") {
    process.stdout.write(`${SHELL_THEME.muted("generating cards and thumbnails...")}\n`);
    const result = await deps.runRepoBatchAction(state, "gallery");
    if (result.notice) {
      writeFeedback(result.notice);
    }
    printOutputPanel(result.panel);
    if (state.repoIntentPrompt) {
      printRepoIntentPrompt(state.repoIntentPrompt, deps.getRepoIntentMenuEntries());
    }
    return true;
  }

  if (slashCommand === "gallery-current") {
    process.stdout.write(`${SHELL_THEME.muted("generating the current gallery assets...")}\n`);
    const result = deps.runCurrentGalleryAction(state);
    if (result.notice) {
      writeFeedback(result.notice);
    }
    printOutputPanel(result.panel);
    return true;
  }

  if (slashCommand === "repo-fixes") {
    process.stdout.write(`${SHELL_THEME.muted("reviewing shared repo issues...")}\n`);
    const result = deps.previewRepoFixesAction(state);
    if (result.notice) {
      writeFeedback(result.notice);
    }
    printOutputPanel(result.panel);
    if (state.repoIntentPrompt) {
      printRepoIntentPrompt(state.repoIntentPrompt, deps.getRepoIntentMenuEntries());
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

export const handleCommonTtyCommand = async (
  slashCommand: string,
  state: ShellState,
  view: TtyShellViewState,
  deps: TtyActionDeps
): Promise<boolean> => {
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
    const result = deps.runBusyOperation(
      {
        title: "choosing",
        lines: ["opening the robot picker..."],
      },
      () => deps.runRepoIntentChoice(state, "work-one")
    );
    view.notice = result.notice;
    view.output = result.panel;
    deps.pushTimelineUserEntry(view, "/work-one");
    deps.archiveAssistantStateToTimeline(view);
    return true;
  }

  if (slashCommand === "gallery") {
    const result = deps.runBusyOperation(
      {
        title: "gallery",
        lines: ["generating cards...", "capturing thumbnails in URDF Studio..."],
      },
      () => deps.runRepoBatchAction(state, "gallery")
    );
    view.notice = result.notice;
    view.output = result.panel;
    deps.pushTimelineUserEntry(view, "/gallery");
    deps.archiveAssistantStateToTimeline(view);
    return true;
  }

  if (slashCommand === "gallery-current") {
    const result = deps.runBusyOperation(
      {
        title: "gallery",
        lines: ["generating the current card...", "capturing the current thumbnail..."],
      },
      () => deps.runCurrentGalleryAction(state)
    );
    view.notice = result.notice;
    view.output = result.panel;
    deps.pushTimelineUserEntry(view, "/gallery-current");
    deps.archiveAssistantStateToTimeline(view);
    return true;
  }

  if (slashCommand === "repo-fixes") {
    const result = deps.runBusyOperation(
      {
        title: "repo fixes",
        lines: ["reviewing shared repo issues...", "showing what ilu can fix safely..."],
      },
      () => deps.previewRepoFixesAction(state)
    );
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
    dismissUpdatePrompt(state);
    try {
      runUpdateCommand();
      view.notice = { kind: "success", text: "ilu is up to date." };
    } catch (error) {
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

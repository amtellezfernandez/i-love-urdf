import type { CompletionCommandSpec } from "./cliCompletion";
import type { SupportedCommandName } from "./commandCatalog";
import type { UpdateAvailability } from "./cliUpdate";

export type ShellOptions = {
  initialSlashCommand?: string;
};

export type PendingValuePrompt = {
  key: string;
  slashName: string;
  title: string;
  examples: readonly string[];
  notes: readonly string[];
  expectsPath: boolean;
};

export type ShellSession = {
  command: SupportedCommandName;
  label: string;
  spec: CompletionCommandSpec;
  args: Map<string, string | boolean>;
  inheritedKeys: Set<string>;
  pending: PendingValuePrompt | null;
};

export type LoadedSourceContext = {
  source: "local-file" | "local-repo" | "github";
  urdfPath: string;
  localPath?: string;
  githubRef?: string;
  repositoryUrdfPath?: string;
};

export type SuggestedActionPrompt = {
  kind: "repair-mesh-refs" | "fix-mesh-paths" | "review-attention";
  summary: string;
  recommendedLine: string;
  prompt: string;
  acceptLabel: string;
  acceptOptionLabel: string;
  skipOptionLabel: string;
};

export type ShellState = {
  session: ShellSession | null;
  rootTask: RootTaskName | null;
  candidatePicker: CandidatePickerState | null;
  xacroRetry: ((pythonExecutable?: string) => AutoAutomationResult) | null;
  loadedSource: LoadedSourceContext | null;
  updatePrompt: UpdateAvailability | null;
  suggestedAction: SuggestedActionPrompt | null;
  lastUrdfPath?: string;
};

export type ShellFeedbackKind = "info" | "success" | "warning" | "error";

export type ShellFeedback = {
  kind: ShellFeedbackKind;
  text: string;
};

export type ShellTimelineEntry = {
  role: "user" | "assistant";
  lines: readonly string[];
  kind: Exclude<ShellFeedbackKind, "warning"> | "warning";
};

export type ShellContextRowTone = "command" | "muted" | "accent";

export type ShellContextRow = {
  label: string;
  value: string;
  tone?: ShellContextRowTone;
};

export type ShellOutputPanel = {
  title: string;
  lines: readonly string[];
  kind: Exclude<ShellFeedbackKind, "warning">;
} | null;

export type TtyMenuEntryKind = "task" | "flow" | "option" | "action" | "system";

export type TtyMenuEntry = {
  name: string;
  summary: string;
  kind: TtyMenuEntryKind;
};

export type TtyShellViewState = {
  input: string;
  timeline: ShellTimelineEntry[];
  menuIndex: number;
  notice: ShellFeedback | null;
  output: ShellOutputPanel;
  busy:
    | {
        title: string;
        lines: readonly string[];
      }
    | null;
};

export type Keypress = {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  name?: string;
  sequence?: string;
};

export type RootTaskName = "open" | "inspect" | "check" | "convert" | "fix";

export type RootTaskDefinition = {
  name: RootTaskName;
  summary: string;
};

export type RootTaskActionDefinition = {
  name: string;
  summary: string;
  command: SupportedCommandName;
  sessionLabel: string;
  openPending?: {
    key: string;
    slashName: string;
    onlyIfMissing?: boolean;
  };
};

export type RootShellCommandDefinition = {
  name: string;
  summary: string;
  command: SupportedCommandName;
  sessionLabel: string;
  openPending?: RootTaskActionDefinition["openPending"];
};

export type LocalPathDrop = {
  inputPath: string;
  absolutePath: string;
  isDirectory: boolean;
  isUrdfFile: boolean;
  isXacroFile: boolean;
  isZipFile: boolean;
};

export type FreeformSessionTarget = {
  key: string;
  slashName: string;
  value: string;
};

export type FreeformRootPlan = {
  rootTask: RootTaskName;
  command: SupportedCommandName;
  label: string;
  key: string;
  slashName: string;
  value: string;
};

export type AppliedFreeformInput = {
  session: ShellSession;
  key: string;
};

export type AutoPreviewPanel = {
  title: string;
  lines: readonly string[];
  kind: Exclude<ShellFeedbackKind, "warning">;
} | null;

export type AutoAutomationResult = {
  panel: AutoPreviewPanel;
  notice: ShellFeedback | null;
  clearSession: boolean;
};

export type RepositoryPreviewCandidate = {
  path: string;
  inspectionMode?: "urdf" | "xacro-source";
  unresolvedMeshReferenceCount?: number;
  xacroArgs?: Array<{ name: string }>;
};

export type RepositoryPreviewPayload = {
  owner?: string;
  repo?: string;
  repositoryUrl?: string;
  inspectedPath?: string;
  candidateCount: number;
  primaryCandidatePath: string | null;
  candidates: RepositoryPreviewCandidate[];
};

export type CandidatePickerState = {
  candidates: RepositoryPreviewCandidate[];
  selectedIndex: number;
  loadArgs: Map<string, string | boolean>;
  extractedArchivePath?: string;
};

export type ShellBangCommandName = "xacro";

export type ShellBangCommandResult = {
  panel: AutoPreviewPanel;
  notice: ShellFeedback;
  clearSession?: boolean;
};

export type SessionOptionPriority = "required" | "common" | "advanced";

export type SessionOptionEntry = {
  key: string;
  name: string;
  summary: string;
  priority: SessionOptionPriority;
};

export type ShellTheme = {
  enabled: boolean;
  brand: (text: string) => string;
  command: (text: string) => string;
  icon: (text: string) => string;
  muted: (text: string) => string;
  section: (text: string) => string;
  success: (text: string) => string;
  accent: (text: string) => string;
  warning: (text: string) => string;
  error: (text: string) => string;
  selected: (text: string) => string;
};

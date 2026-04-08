import { type CompletionOptionSpec } from "./cliCompletion";
import { type SupportedCommandName } from "./commandCatalog";
import type { RootShellCommandDefinition, RootTaskActionDefinition, RootTaskName, ShellFeedback, ShellFeedbackKind, ShellSession, ShellState, ShellTheme } from "./cliShellTypes";
import type { UpdateAvailability } from "./cliUpdate";
export declare const SHELL_THEME: ShellTheme;
export declare const SHELL_BRAND = "i<3urdf";
export declare const XACRO_RUNTIME_NOTICE = "xacro runtime not set. run !xacro, then retry";
export declare const SHELL_BUILTIN_COMMANDS: readonly [{
    readonly name: "help";
    readonly summary: "Show slash commands for the current context.";
}, {
    readonly name: "visualize";
    readonly summary: "Open the current ilu session in URDF Studio.";
}, {
    readonly name: "visualize-stop";
    readonly summary: "Stop the local URDF Studio started by ilu.";
}, {
    readonly name: "doctor";
    readonly summary: "Show runtime, auth, and xacro diagnostics.";
}, {
    readonly name: "update";
    readonly summary: "Install the latest ilu release.";
}, {
    readonly name: "clear";
    readonly summary: "Clear the terminal.";
}, {
    readonly name: "last";
    readonly summary: "Show the last remembered URDF path.";
}];
export declare const HIDDEN_SHELL_COMMAND_NAMES: readonly ["exit", "quit"];
export declare const SESSION_BUILTIN_COMMANDS: readonly [{
    readonly name: "show";
    readonly summary: "Show the current command, values, and next step.";
}, {
    readonly name: "run";
    readonly summary: "Run the current command.";
}, {
    readonly name: "visualize";
    readonly summary: "Open the current ilu session in URDF Studio.";
}, {
    readonly name: "visualize-stop";
    readonly summary: "Stop the local URDF Studio started by ilu.";
}, {
    readonly name: "doctor";
    readonly summary: "Show runtime, auth, and xacro diagnostics.";
}, {
    readonly name: "update";
    readonly summary: "Install the latest ilu release.";
}, {
    readonly name: "reset";
    readonly summary: "Clear the current command state.";
}, {
    readonly name: "back";
    readonly summary: "Return to the root slash-command menu.";
}];
export declare const ROOT_TASKS: readonly [{
    readonly name: "open";
    readonly summary: "Open a repo, folder, or file as a working URDF.";
}, {
    readonly name: "inspect";
    readonly summary: "Preview a repo or URDF before deciding what to do next.";
}, {
    readonly name: "check";
    readonly summary: "Run health, validation, and orientation checks.";
}, {
    readonly name: "convert";
    readonly summary: "Convert XACRO and URDF files into other formats.";
}, {
    readonly name: "fix";
    readonly summary: "Repair mesh paths, mesh refs, and basic URDF issues.";
}, {
    readonly name: "preview";
    readonly summary: "Select a source for gallery card generation.";
}];
export declare const ROOT_SHELL_COMMANDS: readonly [{
    readonly name: "open";
    readonly summary: "Load a repo, folder, or file as the current source.";
    readonly command: "load-source";
    readonly sessionLabel: "open";
}, {
    readonly name: "assemble";
    readonly summary: "Create a shared local assembly workspace from one or more URDF files.";
    readonly command: "assemble";
    readonly sessionLabel: "assemble";
    readonly openPending: {
        readonly key: "urdf";
        readonly slashName: "file";
        readonly onlyIfMissing: true;
    };
}, {
    readonly name: "replace";
    readonly summary: "Replace an embedded robot with a new one and save an updated URDF.";
    readonly command: "replace-subrobot";
    readonly sessionLabel: "replace";
    readonly openPending: {
        readonly key: "urdf";
        readonly slashName: "host";
        readonly onlyIfMissing: true;
    };
}, {
    readonly name: "inspect";
    readonly summary: "Preview a repo or folder and suggest the best entrypoint.";
    readonly command: "inspect-repo";
    readonly sessionLabel: "inspect";
}, {
    readonly name: "analyze";
    readonly summary: "Inspect structure, morphology, and mesh references.";
    readonly command: "analyze";
    readonly sessionLabel: "analyze";
    readonly openPending: {
        readonly key: "urdf";
        readonly slashName: "file";
        readonly onlyIfMissing: true;
    };
}, {
    readonly name: "health";
    readonly summary: "Check structure, axes, and orientation risks.";
    readonly command: "health-check";
    readonly sessionLabel: "health";
    readonly openPending: {
        readonly key: "urdf";
        readonly slashName: "file";
        readonly onlyIfMissing: true;
    };
}, {
    readonly name: "validate";
    readonly summary: "Check whether the current URDF is structurally valid.";
    readonly command: "validate";
    readonly sessionLabel: "validate";
    readonly openPending: {
        readonly key: "urdf";
        readonly slashName: "file";
        readonly onlyIfMissing: true;
    };
}, {
    readonly name: "orientation";
    readonly summary: "Check the current orientation and offer a safe fix.";
    readonly command: "guess-orientation";
    readonly sessionLabel: "orientation";
    readonly openPending: {
        readonly key: "urdf";
        readonly slashName: "file";
        readonly onlyIfMissing: true;
    };
}];
export declare const ROOT_START_COMMAND_NAMES: readonly ["open", "assemble", "replace", "inspect", "analyze", "health", "validate", "orientation"];
export declare const ROOT_READY_COMMAND_NAMES: readonly ["assemble", "replace", "analyze", "health", "validate", "orientation", "open", "inspect"];
export declare const FLAT_ROOT_SESSION_LABELS: Set<string>;
export declare const ROOT_TASK_ACTIONS: {
    readonly open: readonly [{
        readonly name: "repo";
        readonly summary: "Open from GitHub into a local working copy.";
        readonly command: "load-source";
        readonly sessionLabel: "open";
        readonly openPending: {
            readonly key: "github";
            readonly slashName: "repo";
        };
    }, {
        readonly name: "local";
        readonly summary: "Open from a local repo or directory.";
        readonly command: "load-source";
        readonly sessionLabel: "open";
        readonly openPending: {
            readonly key: "path";
            readonly slashName: "local";
        };
    }, {
        readonly name: "file";
        readonly summary: "Open a local URDF file directly.";
        readonly command: "load-source";
        readonly sessionLabel: "open";
        readonly openPending: {
            readonly key: "path";
            readonly slashName: "file";
        };
    }, {
        readonly name: "assemble";
        readonly summary: "Create a local assembly workspace from one or more URDF files.";
        readonly command: "assemble";
        readonly sessionLabel: "assemble";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }];
    readonly inspect: readonly [{
        readonly name: "repo";
        readonly summary: "Preview a GitHub repo and suggest the right entrypoint.";
        readonly command: "inspect-repo";
        readonly sessionLabel: "inspect";
        readonly openPending: {
            readonly key: "github";
            readonly slashName: "repo";
        };
    }, {
        readonly name: "local";
        readonly summary: "Preview a local repo and suggest the right entrypoint.";
        readonly command: "inspect-repo";
        readonly sessionLabel: "inspect";
        readonly openPending: {
            readonly key: "local";
            readonly slashName: "local";
        };
    }, {
        readonly name: "file";
        readonly summary: "Inspect a prepared URDF file.";
        readonly command: "analyze";
        readonly sessionLabel: "inspect";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }];
    readonly check: readonly [{
        readonly name: "health";
        readonly summary: "Run the main URDF health check.";
        readonly command: "health-check";
        readonly sessionLabel: "check";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }, {
        readonly name: "validate";
        readonly summary: "Validate URDF structure and required tags.";
        readonly command: "validate";
        readonly sessionLabel: "check";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }, {
        readonly name: "orientation";
        readonly summary: "Check the current orientation and offer a safe fix.";
        readonly command: "guess-orientation";
        readonly sessionLabel: "check";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }];
    readonly convert: readonly [{
        readonly name: "xacro";
        readonly summary: "Expand a XACRO file, repo, or GitHub source into URDF.";
        readonly command: "xacro-to-urdf";
        readonly sessionLabel: "convert";
        readonly openPending: {
            readonly key: "xacro";
            readonly slashName: "xacro";
        };
    }, {
        readonly name: "mjcf";
        readonly summary: "Convert a URDF file into MJCF.";
        readonly command: "urdf-to-mjcf";
        readonly sessionLabel: "convert";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }, {
        readonly name: "usd";
        readonly summary: "Convert a URDF file into initial USD output.";
        readonly command: "urdf-to-usd";
        readonly sessionLabel: "convert";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }];
    readonly fix: readonly [{
        readonly name: "mesh-paths";
        readonly summary: "Repair package:// and relative mesh paths in a URDF file.";
        readonly command: "fix-mesh-paths";
        readonly sessionLabel: "fix";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }, {
        readonly name: "mesh-refs";
        readonly summary: "Repair missing mesh references in a repo-based source.";
        readonly command: "repair-mesh-refs";
        readonly sessionLabel: "fix";
    }, {
        readonly name: "axes";
        readonly summary: "Normalize non-unit or awkward joint axes in a URDF file.";
        readonly command: "normalize-axes";
        readonly sessionLabel: "fix";
        readonly openPending: {
            readonly key: "urdf";
            readonly slashName: "file";
            readonly onlyIfMissing: true;
        };
    }];
    readonly preview: readonly [{
        readonly name: "repo";
        readonly summary: "Select a GitHub repo and generate cards for every robot in it.";
        readonly command: "load-source";
        readonly sessionLabel: "preview";
        readonly openPending: {
            readonly key: "github";
            readonly slashName: "repo";
        };
    }, {
        readonly name: "folder";
        readonly summary: "Select a local folder and generate cards for every URDF in it.";
        readonly command: "load-source";
        readonly sessionLabel: "preview";
        readonly openPending: {
            readonly key: "path";
            readonly slashName: "folder";
        };
    }, {
        readonly name: "urdf";
        readonly summary: "Select one URDF file and generate a single card from it.";
        readonly command: "load-source";
        readonly sessionLabel: "preview";
        readonly openPending: {
            readonly key: "path";
            readonly slashName: "urdf";
        };
    }];
};
export declare const COMMAND_SUMMARY_OVERRIDES: Partial<Record<SupportedCommandName, string>>;
export declare const URDF_OUTPUT_COMMANDS: Set<"inspect-meshes" | "compress-meshes" | "mesh-refs" | "health-check" | "snap-axes" | "apply-orientation" | "canonicalize-joint-frame" | "pretty-print" | "canonical-order" | "validate" | "analyze" | "robot-type" | "morphology-card" | "gallery-generate" | "gallery-render" | "gallery-build-publish" | "guess-orientation" | "diff" | "fix-mesh-paths" | "bundle-mesh-assets" | "normalize-axes" | "set-joint-axis" | "set-joint-origin" | "set-joint-type" | "set-joint-limits" | "set-joint-velocity" | "rotate-90" | "normalize-robot" | "remove-joints" | "reassign-joint" | "set-material-color" | "merge-urdf" | "replace-subrobot" | "mesh-to-assets" | "urdf-to-mjcf" | "urdf-to-usd" | "urdf-to-xacro" | "xacro-to-urdf" | "probe-xacro-runtime" | "setup-xacro-runtime" | "load-source" | "assemble" | "rename-joint" | "rename-link" | "inspect-repo" | "repair-mesh-refs" | "repo-fixes">;
export declare const ADVANCED_OPTION_KEYS: Set<string>;
export declare const SESSION_OPTION_ORDER: {
    readonly assemble: readonly ["urdf", "attach", "name"];
    readonly "replace-subrobot": readonly ["urdf", "replacement", "replace-root", "replacement-root", "mount-parent", "mount-joint", "prefix", "xyz", "rpy", "calibrate", "portable", "out"];
    readonly "bundle-mesh-assets": readonly ["urdf", "out"];
    readonly "set-joint-origin": readonly ["urdf", "joint", "xyz", "rpy", "out"];
    readonly "load-source": readonly ["github", "path", "entry", "out", "ref", "subdir", "args", "python", "wheel", "token", "root"];
    readonly "inspect-repo": readonly ["github", "local", "path", "ref", "max-candidates", "token", "out"];
    readonly "repair-mesh-refs": readonly ["github", "local", "urdf", "path", "ref", "token", "out"];
    readonly "xacro-to-urdf": readonly ["xacro", "github", "local", "entry", "out", "args", "ref", "path", "python", "wheel", "token", "root"];
    readonly "health-check": readonly ["urdf", "strict"];
    readonly validate: readonly ["urdf"];
    readonly analyze: readonly ["urdf"];
    readonly diff: readonly ["left", "right"];
};
export declare const MUTUALLY_EXCLUSIVE_OPTION_GROUPS: Partial<Record<SupportedCommandName, readonly (readonly string[])[]>>;
export declare const SESSION_SLASH_ALIASES: Partial<Record<SupportedCommandName, Readonly<Record<string, string>>>>;
export declare const CLI_ENTRY_PATH: string;
export declare const ROOT_GUIDANCE = "1 single  2 assembly  3 substitute  4 preview";
export declare const formatShellPrompt: (_state: ShellState) => string;
export declare const hasPendingUpdatePrompt: (state: ShellState) => boolean;
export declare const dismissUpdatePrompt: (state: ShellState) => void;
export declare const formatUpdatePromptLine: (update: UpdateAvailability) => string;
export declare const quoteForPreview: (value: string) => string;
export declare const buildCommandPreview: (command: string, args: Map<string, string | boolean>) => string;
export declare const pushFeedback: (feedback: ShellFeedback[] | undefined, kind: ShellFeedbackKind, text: string) => void;
export declare const writeFeedback: (entry: ShellFeedback) => void;
export declare const flushFeedback: (feedback: readonly ShellFeedback[]) => void;
export declare const stripAnsi: (value: string) => string;
export declare const clamp: (value: number, minimum: number, maximum: number) => number;
export declare const formatInlineValue: (value: string) => string;
export declare const clearCandidatePicker: (state: ShellState) => void;
export declare const clearXacroRetry: (state: ShellState) => void;
export declare const clearSuggestedAction: (state: ShellState) => void;
export declare const hasGitHubAuthConfigured: () => boolean;
export declare const getSlashAliasesForCommand: (command: SupportedCommandName) => Readonly<Record<string, string>>;
export declare const getOptionSpecByKey: (session: ShellSession, key: string) => CompletionOptionSpec | undefined;
export declare const getPreferredSlashName: (session: ShellSession, key: string) => string;
export declare const getSlashDisplayName: (session: ShellSession, key: string) => string;
export declare const getShellCommandSummary: (command: SupportedCommandName) => string;
export declare const getRootTaskSummary: (task: RootTaskName) => string;
export declare const getRootTaskActionDefinitions: (task: RootTaskName) => readonly RootTaskActionDefinition[];
export declare const getRootShellCommandDefinition: (name: string) => RootShellCommandDefinition | undefined;
export declare const isFlatRootSession: (session: ShellSession) => boolean;
export declare const shouldSuppressSessionOptionMenu: (session: ShellSession) => boolean;
export declare const getOptionOrderRank: (session: ShellSession, key: string) => number;

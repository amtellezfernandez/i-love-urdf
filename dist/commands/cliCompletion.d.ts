import { type SupportedCommandName } from "./commandCatalog";
export declare const COMPLETION_SHELLS: readonly ["bash", "zsh", "fish"];
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];
export type CompletionOptionSpec = {
    flag: `--${string}`;
    valueHint?: string;
    valueChoices?: readonly string[];
    isFilesystemPath?: boolean;
};
export type CompletionCommandSpec = {
    name: SupportedCommandName;
    summary: string;
    options: readonly CompletionOptionSpec[];
    requiredAlternatives: readonly (readonly string[])[];
};
export declare const COMMAND_COMPLETION_SPECS: readonly CompletionCommandSpec[];
export declare const COMMAND_COMPLETION_SPEC_BY_NAME: Readonly<Record<SupportedCommandName, CompletionCommandSpec>>;
export declare const isCompletionShell: (value: string) => value is CompletionShell;
export declare const renderCompletionHelp: () => string;
export declare const renderCompletionScript: (shell: CompletionShell) => string;

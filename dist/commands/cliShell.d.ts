import type { ShellOptions } from "./cliShellTypes";
export declare const renderShellHelp: () => string;
export declare const runInteractiveShell: (options?: ShellOptions) => Promise<void>;

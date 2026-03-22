type ShellOptions = {
    initialSlashCommand?: string;
};
export declare const renderShellHelp: () => string;
export declare const runInteractiveShell: (options?: ShellOptions) => Promise<void>;
export {};

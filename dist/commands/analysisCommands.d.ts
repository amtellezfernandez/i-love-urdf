import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
declare const ANALYSIS_COMMAND_HANDLERS: {
    readonly diff: (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly validate: (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly "health-check": (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly analyze: (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly "robot-type": (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly "morphology-card": (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly "guess-orientation": (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly "inspect-meshes": (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly "compress-meshes": (args: CliArgMap, helpers: CliCommandHelpers) => void;
    readonly "mesh-refs": (args: CliArgMap, helpers: CliCommandHelpers) => void;
};
export type AnalysisCommandName = keyof typeof ANALYSIS_COMMAND_HANDLERS;
export declare const ANALYSIS_COMMANDS: AnalysisCommandName[];
export declare const isAnalysisCommand: (command: string) => command is AnalysisCommandName;
export declare const runAnalysisCommand: (command: AnalysisCommandName, args: CliArgMap, helpers: CliCommandHelpers) => Promise<void>;
export {};

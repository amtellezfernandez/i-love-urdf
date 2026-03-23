import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
import type { SourceCommandHelpers } from "./sourceCommandRuntime";
declare const SOURCE_COMMAND_HANDLERS: {
    readonly "load-source": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "urdf-to-usd": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "xacro-to-urdf": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "probe-xacro-runtime": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "setup-xacro-runtime": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "inspect-repo": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "repair-mesh-refs": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "gallery-generate": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
    readonly "repo-fixes": (args: CliArgMap, helpers: SourceCommandHelpers) => Promise<void>;
};
export type SourceCommandName = keyof typeof SOURCE_COMMAND_HANDLERS;
export declare const SOURCE_COMMANDS: SourceCommandName[];
export declare const isSourceCommand: (command: string) => command is SourceCommandName;
export declare const runSourceCommand: (command: SourceCommandName, args: CliArgMap, helpers: SourceCommandHelpers | CliCommandHelpers) => Promise<void>;
export {};

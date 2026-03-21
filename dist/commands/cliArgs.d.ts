import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
import { type CommandName } from "./commandCatalog";
export type ParsedCliArgs = {
    rawCommand: string;
    command: CommandName;
    args: CliArgMap;
};
export declare const parseArgs: (argv: string[]) => ParsedCliArgs;
export declare const createCliCommandHelpers: () => CliCommandHelpers;

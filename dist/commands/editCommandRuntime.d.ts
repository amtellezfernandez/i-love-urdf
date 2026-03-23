import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
export type EditCommandContext = {
    args: CliArgMap;
    helpers: CliCommandHelpers;
    urdfPath: string;
    urdfContent: string;
    outPath: string | undefined;
};
export type EditCommandHandler = (context: EditCommandContext) => Promise<void> | void;
export declare const emitJson: (value: unknown) => void;
export declare const emitWrittenPayload: <T extends object>(helpers: CliCommandHelpers, outPath: string | undefined, writtenContent: string, payload: T) => void;
export declare const createEditCommandContext: (args: CliArgMap, helpers: CliCommandHelpers) => EditCommandContext;
export declare const readSelectedJointNames: (args: CliArgMap, helpers: CliCommandHelpers) => string[];

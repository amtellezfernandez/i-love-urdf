import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
import { EDIT_CONVERSION_COMMAND_HANDLERS } from "./editConversionCommands";
import { createEditCommandContext, type EditCommandHandler } from "./editCommandRuntime";
import { EDIT_FORMATTING_COMMAND_HANDLERS } from "./editFormattingCommands";
import { EDIT_JOINT_COMMAND_HANDLERS } from "./editJointCommands";
import { EDIT_ORIENTATION_COMMAND_HANDLERS } from "./editOrientationCommands";

const EDIT_COMMAND_HANDLERS = {
  ...EDIT_FORMATTING_COMMAND_HANDLERS,
  ...EDIT_JOINT_COMMAND_HANDLERS,
  ...EDIT_ORIENTATION_COMMAND_HANDLERS,
  ...EDIT_CONVERSION_COMMAND_HANDLERS,
} as const satisfies Record<string, EditCommandHandler>;

export type EditCommandName = keyof typeof EDIT_COMMAND_HANDLERS;

export const EDIT_COMMANDS = Object.keys(EDIT_COMMAND_HANDLERS) as EditCommandName[];

const EDIT_COMMAND_SET = new Set<EditCommandName>(EDIT_COMMANDS);

export const isEditCommand = (command: string): command is EditCommandName =>
  EDIT_COMMAND_SET.has(command as EditCommandName);

export const runEditCommand = async (
  command: EditCommandName,
  args: CliArgMap,
  helpers: CliCommandHelpers
): Promise<void> => {
  const context = createEditCommandContext(args, helpers);
  await EDIT_COMMAND_HANDLERS[command](context);
};

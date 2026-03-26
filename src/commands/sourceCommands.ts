import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
import { SOURCE_GALLERY_COMMAND_HANDLERS } from "./sourceGalleryCommands";
import { SOURCE_LOAD_COMMAND_HANDLERS } from "./sourceLoadCommands";
import { SOURCE_REPOSITORY_COMMAND_HANDLERS } from "./sourceRepositoryCommands";
import { SOURCE_STUDIO_COMMAND_HANDLERS } from "./sourceStudioCommands";
import type { SourceCommandHandler, SourceCommandHelpers } from "./sourceCommandRuntime";
import { SOURCE_XACRO_COMMAND_HANDLERS } from "./sourceXacroCommands";

const SOURCE_COMMAND_HANDLERS = {
  ...SOURCE_GALLERY_COMMAND_HANDLERS,
  ...SOURCE_REPOSITORY_COMMAND_HANDLERS,
  ...SOURCE_XACRO_COMMAND_HANDLERS,
  ...SOURCE_LOAD_COMMAND_HANDLERS,
  ...SOURCE_STUDIO_COMMAND_HANDLERS,
} as const satisfies Record<string, SourceCommandHandler>;

export type SourceCommandName = keyof typeof SOURCE_COMMAND_HANDLERS;

export const SOURCE_COMMANDS = Object.keys(SOURCE_COMMAND_HANDLERS) as SourceCommandName[];

const SOURCE_COMMAND_SET = new Set<SourceCommandName>(SOURCE_COMMANDS);

export const isSourceCommand = (command: string): command is SourceCommandName =>
  SOURCE_COMMAND_SET.has(command as SourceCommandName);

export const runSourceCommand = async (
  command: SourceCommandName,
  args: CliArgMap,
  helpers: SourceCommandHelpers | CliCommandHelpers
): Promise<void> => {
  await SOURCE_COMMAND_HANDLERS[command](args, helpers);
};

import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
import { ANALYSIS_MESH_COMMAND_HANDLERS } from "./analysisMeshCommands";
import type { AnalysisCommandHandler } from "./analysisCommandRuntime";
import { ANALYSIS_URDF_COMMAND_HANDLERS } from "./analysisUrdfCommands";

const ANALYSIS_COMMAND_HANDLERS = {
  ...ANALYSIS_MESH_COMMAND_HANDLERS,
  ...ANALYSIS_URDF_COMMAND_HANDLERS,
} as const satisfies Record<string, AnalysisCommandHandler>;

export type AnalysisCommandName = keyof typeof ANALYSIS_COMMAND_HANDLERS;

export const ANALYSIS_COMMANDS = Object.keys(ANALYSIS_COMMAND_HANDLERS) as AnalysisCommandName[];

const ANALYSIS_COMMAND_SET = new Set<AnalysisCommandName>(ANALYSIS_COMMANDS);

export const isAnalysisCommand = (command: string): command is AnalysisCommandName =>
  ANALYSIS_COMMAND_SET.has(command as AnalysisCommandName);

export const runAnalysisCommand = async (
  command: AnalysisCommandName,
  args: CliArgMap,
  helpers: CliCommandHelpers
): Promise<void> => {
  await ANALYSIS_COMMAND_HANDLERS[command](args, helpers);
};

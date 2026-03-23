import { ANALYSIS_COMMANDS, type AnalysisCommandName } from "./analysisCommands";
import { SUPPORTED_COMMANDS, type SupportedCommandName } from "./commandCatalog";
import { EDIT_COMMANDS, type EditCommandName } from "./editCommands";
import { SOURCE_COMMANDS, type SourceCommandName } from "./sourceCommands";

type RegisteredCommandName = SourceCommandName | AnalysisCommandName | EditCommandName;
type AssertNever<T extends never> = T;

type _CatalogCommandsCovered = AssertNever<Exclude<SupportedCommandName, RegisteredCommandName>>;
type _NoExtraRegisteredCommands = AssertNever<Exclude<RegisteredCommandName, SupportedCommandName>>;

export const REGISTERED_COMMANDS = [
  ...SOURCE_COMMANDS,
  ...ANALYSIS_COMMANDS,
  ...EDIT_COMMANDS,
] as const satisfies readonly RegisteredCommandName[];

export const assertCommandConsistency = () => {
  const registeredSet = new Set<string>(REGISTERED_COMMANDS);
  const catalogSet = new Set<string>(SUPPORTED_COMMANDS);

  const duplicateCommands = REGISTERED_COMMANDS.filter(
    (commandName, index) => REGISTERED_COMMANDS.indexOf(commandName) !== index
  );
  if (duplicateCommands.length > 0) {
    throw new Error(
      `Duplicate CLI command registrations detected: ${Array.from(new Set(duplicateCommands)).join(", ")}`
    );
  }

  const missingFromRegistries = SUPPORTED_COMMANDS.filter((commandName) => !registeredSet.has(commandName));
  const missingFromCatalog = REGISTERED_COMMANDS.filter((commandName) => !catalogSet.has(commandName));
  if (missingFromRegistries.length === 0 && missingFromCatalog.length === 0) {
    return;
  }

  const problems = [
    missingFromRegistries.length > 0
      ? `missing handlers for: ${missingFromRegistries.join(", ")}`
      : null,
    missingFromCatalog.length > 0
      ? `missing catalog entries for: ${missingFromCatalog.join(", ")}`
      : null,
  ]
    .filter((problem): problem is string => Boolean(problem))
    .join("; ");

  throw new Error(`CLI command metadata drift detected: ${problems}`);
};

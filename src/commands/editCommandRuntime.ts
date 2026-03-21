import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";

export type EditCommandContext = {
  args: CliArgMap;
  helpers: CliCommandHelpers;
  urdfPath: string;
  urdfContent: string;
  outPath: string | undefined;
};

export type EditCommandHandler = (context: EditCommandContext) => Promise<void> | void;

export const emitJson = (value: unknown) => {
  console.log(JSON.stringify(value, null, 2));
};

export const emitWrittenPayload = <T extends object>(
  helpers: CliCommandHelpers,
  outPath: string | undefined,
  writtenContent: string,
  payload: T
) => {
  helpers.writeOutIfRequested(outPath, writtenContent);
  emitJson({ ...payload, outPath: outPath || null });
};

export const createEditCommandContext = (
  args: CliArgMap,
  helpers: CliCommandHelpers
): EditCommandContext => {
  const urdfPath = helpers.getOptionalStringArg(args, "urdf");
  if (!urdfPath) {
    helpers.fail("Missing required argument --urdf");
  }

  return {
    args,
    helpers,
    urdfPath,
    urdfContent: helpers.readText(urdfPath),
    outPath: helpers.getOptionalStringArg(args, "out"),
  };
};

export const readSelectedJointNames = (
  args: CliArgMap,
  helpers: CliCommandHelpers
): string[] => helpers.getDelimitedStringArg(args, "joints", "joint");

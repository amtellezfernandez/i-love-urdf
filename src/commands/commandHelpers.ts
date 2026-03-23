export type CliArgMap = Map<string, string | boolean>;

export type CliCommandHelpers = {
  fail: (message: string) => never;
  readText: (filePath: string) => string;
  requireStringArg: (args: CliArgMap, key: string) => string;
  getOptionalStringArg: (args: CliArgMap, key: string) => string | undefined;
  getOptionalNumberArg: (args: CliArgMap, key: string) => number | undefined;
  getDelimitedStringArg: (args: CliArgMap, primaryKey: string, fallbackKey?: string) => string[];
  getKeyValueArg: (args: CliArgMap, primaryKey: string, fallbackKey?: string) => Record<string, string>;
  getNumericKeyValueArg: (
    args: CliArgMap,
    primaryKey: string,
    fallbackKey?: string
  ) => Record<string, number>;
  parseTripletArg: (raw: string, label: string) => [number, number, number];
  getAxisSpecArg: (
    args: CliArgMap,
    key: string
  ) => "x" | "y" | "z" | "+x" | "+y" | "+z" | "-x" | "-y" | "-z" | undefined;
  getSimpleAxisArg: (args: CliArgMap, key: string) => "x" | "y" | "z" | undefined;
  requireHexColorArg: (args: CliArgMap, key: string) => string;
  writeOutIfRequested: (outPath: string | undefined, content: string) => void;
};

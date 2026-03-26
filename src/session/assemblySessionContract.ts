export const ILU_ASSEMBLY_SESSION_SCHEMA = "ilu-assembly-session" as const;
export const ILU_ASSEMBLY_SESSION_SCHEMA_VERSION = 1 as const;

export type IluAssemblySessionSource = {
  type: "local";
  rootPath: string;
  folderLabel: string;
};

export type IluAssemblySessionRobot = {
  id: string;
  name: string;
  sourcePrefix: string;
  selectedPath: string;
  source: IluAssemblySessionSource;
};

export type IluAssemblySessionSnapshot = {
  schema: typeof ILU_ASSEMBLY_SESSION_SCHEMA;
  schemaVersion: typeof ILU_ASSEMBLY_SESSION_SCHEMA_VERSION;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  workspaceRoot: string;
  selectedPaths: string[];
  namesByPath: Record<string, string>;
  sourceByPath: Record<string, { type: "local"; folder?: string }>;
  robots: IluAssemblySessionRobot[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const coerceAssemblySource = (raw: unknown): IluAssemblySessionSource | null => {
  if (!isRecord(raw) || raw.type !== "local") {
    return null;
  }

  if (typeof raw.rootPath !== "string" || typeof raw.folderLabel !== "string") {
    return null;
  }

  return {
    type: "local",
    rootPath: raw.rootPath,
    folderLabel: raw.folderLabel,
  };
};

const coerceAssemblyRobot = (raw: unknown): IluAssemblySessionRobot | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const source = coerceAssemblySource(raw.source);
  if (
    !source ||
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.sourcePrefix !== "string" ||
    typeof raw.selectedPath !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    name: raw.name,
    sourcePrefix: raw.sourcePrefix,
    selectedPath: raw.selectedPath,
    source,
  };
};

const coerceSourceByPath = (
  raw: unknown
): IluAssemblySessionSnapshot["sourceByPath"] => {
  if (!isRecord(raw)) {
    return {};
  }

  const entries = Object.entries(raw)
    .filter(([, value]) => isRecord(value) && value.type === "local")
    .map(([key, value]) => [
      key,
      {
        type: "local" as const,
        folder:
          isRecord(value) && typeof value.folder === "string" ? value.folder : undefined,
      },
    ] as const);

  return Object.fromEntries(entries);
};

export const coerceIluAssemblySessionSnapshot = (
  raw: unknown
): IluAssemblySessionSnapshot | null => {
  if (!isRecord(raw)) {
    return null;
  }

  if (
    raw.schema !== ILU_ASSEMBLY_SESSION_SCHEMA ||
    raw.schemaVersion !== ILU_ASSEMBLY_SESSION_SCHEMA_VERSION ||
    typeof raw.sessionId !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.workspaceRoot !== "string" ||
    !Array.isArray(raw.selectedPaths) ||
    !isRecord(raw.namesByPath) ||
    !Array.isArray(raw.robots)
  ) {
    return null;
  }

  const robots = raw.robots
    .map((robot) => coerceAssemblyRobot(robot))
    .filter((robot): robot is IluAssemblySessionRobot => robot !== null);

  if (robots.length !== raw.robots.length) {
    return null;
  }

  return {
    schema: ILU_ASSEMBLY_SESSION_SCHEMA,
    schemaVersion: ILU_ASSEMBLY_SESSION_SCHEMA_VERSION,
    sessionId: raw.sessionId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    label: raw.label,
    workspaceRoot: raw.workspaceRoot,
    selectedPaths: raw.selectedPaths.filter((value): value is string => typeof value === "string"),
    namesByPath: Object.fromEntries(
      Object.entries(raw.namesByPath).filter((entry) => typeof entry[1] === "string")
    ) as Record<string, string>,
    sourceByPath: coerceSourceByPath(raw.sourceByPath),
    robots,
  };
};

export const buildIluAssemblyStudioUrl = (studioBaseUrl: string, assemblySessionId: string): string => {
  const studioUrl = new URL(studioBaseUrl);
  studioUrl.searchParams.set("ilu_assembly", assemblySessionId);
  return studioUrl.toString();
};

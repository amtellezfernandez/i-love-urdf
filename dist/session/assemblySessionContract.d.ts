export declare const ILU_ASSEMBLY_SESSION_SCHEMA: "ilu-assembly-session";
export declare const ILU_ASSEMBLY_SESSION_SCHEMA_VERSION: 1;
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
    sourceByPath: Record<string, {
        type: "local";
        folder?: string;
    }>;
    robots: IluAssemblySessionRobot[];
};
export declare const coerceIluAssemblySessionSnapshot: (raw: unknown) => IluAssemblySessionSnapshot | null;
export declare const buildIluAssemblyStudioUrl: (studioBaseUrl: string, assemblySessionId: string) => string;

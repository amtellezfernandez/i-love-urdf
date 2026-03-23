export type RepositoryFileEntry = {
    path: string;
    type: "file" | "dir";
};
export type PackageNameByPath = ReadonlyMap<string, string | null | undefined> | Record<string, string | null | undefined>;
export type BuildPackageRootsOptions = {
    packageNameByPath?: PackageNameByPath;
};
export declare const normalizeRepositoryPath: (path: string) => string;
export declare const extractPackageNameFromPackageXml: (content: string) => string | null;
export declare const buildRepositoryFileEntriesFromPaths: (paths: Iterable<string>) => RepositoryFileEntry[];
export declare const repositoryDirname: (path: string) => string;
export declare const resolveMeshPathInRepository: <T extends RepositoryFileEntry>(urdfPath: string, meshRef: string, lowerCaseFileMap: Map<string, T>) => T | null;
export declare const collectXacroSupportFilesFromRepository: <T extends RepositoryFileEntry>(files: T[], targetPath: string) => T[];
export declare const buildPackageRootsFromRepositoryFiles: <T extends RepositoryFileEntry>(files: T[], options?: BuildPackageRootsOptions) => Record<string, string[]>;
export declare const resolveRepositoryFileReference: <T extends RepositoryFileEntry>(urdfPath: string, meshRef: string, files: T[], options?: {
    packageRoots?: Record<string, string[]>;
    supportedMeshExtensions?: readonly string[];
    meshDirOverride?: string;
}) => T | null;
export declare const resolveRepositoryMeshReferences: <T extends RepositoryFileEntry>(urdfPath: string, urdfText: string, files: T[], options?: {
    packageRoots?: Record<string, string[]>;
    supportedMeshExtensions?: readonly string[];
}) => {
    matches: T[];
    matchByReference: Map<string, T>;
    unresolved: string[];
};

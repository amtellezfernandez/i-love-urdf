import { type RepositoryFileEntry } from "./repositoryMeshResolution";
export type RepositoryNamedFileEntry = RepositoryFileEntry & {
    name: string;
};
export type RepositoryUrdfCandidate = {
    path: string;
    name: string;
    hasMeshesFolder: boolean;
    meshesFolderPath?: string;
    hasUnsupportedFormats?: boolean;
    unsupportedFormats?: string[];
    unmatchedMeshReferences?: string[];
    isXacro?: boolean;
};
export type XacroArgumentDefinition = {
    name: string;
    hasDefault: boolean;
    defaultValue: string | null;
    isRequired: boolean;
};
export declare const resolveRepositoryXacroTargetPath: <T extends RepositoryFileEntry>(files: T[], targetPath: string) => string;
export declare const findRepositoryUrdfCandidates: <T extends RepositoryNamedFileEntry>(files: T[]) => RepositoryUrdfCandidate[];
export declare const extractXacroArgumentDefinitions: (xacroContent: string) => XacroArgumentDefinition[];
export declare const extractMeshReferencesFromUrdf: (urdfContent: string) => string[];
export declare const detectUnsupportedMeshFormats: (urdfContent: string) => {
    hasUnsupported: boolean;
    formats: string[];
};
export declare const hasRenderableUrdfGeometry: (urdfText: string) => boolean;
export declare const collectPackageNamesFromText: (text: string) => string[];
export declare const collectMeshReferencedPackageNamesFromUrdf: (urdfText: string) => string[];
export declare const buildDependencyRepositoryNameCandidates: (packageName: string) => string[];
export declare const repositoryContainsPackage: <T extends RepositoryFileEntry>(files: T[], packageName: string, repositoryName: string) => boolean;
export declare const findPackageXmlForPackageName: <T extends RepositoryFileEntry>(files: T[], packageName: string) => T | null;
export declare const collectPackageResourceFilesForReferencedPackages: <T extends RepositoryFileEntry>(files: T[], packageNames: string[], packageRoots?: Record<string, string[]>) => T[];
export declare const collectPackageResourceFilesForMatchedFiles: <T extends RepositoryFileEntry>(files: T[], matchedFiles: T[], packageRoots?: Record<string, string[]>) => T[];
export declare const scoreXacroWrapperCandidate: (path: string) => number;
export declare const collectTargetPathHints: (targetPath: string) => string[];
export declare const getSupportedMeshExtensions: () => readonly string[];

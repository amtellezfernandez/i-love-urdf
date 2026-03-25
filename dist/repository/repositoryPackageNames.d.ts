import { type PackageNameByPath, type RepositoryFileEntry } from "./repositoryMeshResolution";
export declare const buildPackageNameByPathFromRepositoryFiles: <T extends RepositoryFileEntry>(files: T[], readText: (file: T) => Promise<string>) => Promise<PackageNameByPath>;

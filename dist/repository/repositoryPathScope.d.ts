import { type RepositoryFileEntry } from "./repositoryMeshResolution";
export type RepositoryScope = {
    kind: "root";
    path: "";
} | {
    kind: "dir" | "file";
    path: string;
};
export declare const matchesRepositoryScope: (repositoryPath: string, scope: RepositoryScope) => boolean;
export declare const resolveRepositoryScopeFromFiles: <T extends RepositoryFileEntry>(files: T[], requestedPath?: string) => RepositoryScope | null;
export declare const resolveRepositoryScopedPathFromFiles: <T extends RepositoryFileEntry>(files: T[], scope: RepositoryScope, requestedPath?: string) => string;

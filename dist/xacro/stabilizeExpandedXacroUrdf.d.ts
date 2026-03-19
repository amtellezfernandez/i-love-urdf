import { type RepositoryFileEntry } from "../repository/repositoryMeshResolution";
export declare const stabilizeExpandedXacroUrdf: <T extends RepositoryFileEntry>(urdfContent: string, entryPath: string, files: T[]) => {
    urdf: string;
    correctionCount: number;
};

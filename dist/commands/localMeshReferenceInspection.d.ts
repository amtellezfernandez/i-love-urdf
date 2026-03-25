import { type PathCorrection } from "../mesh/fixMeshPaths";
import { parseMeshReference } from "../mesh/meshPaths";
type LocalPackageContext = {
    packageName: string | null;
    packageRoot: string | null;
    packageXmlPath: string | null;
};
export type LocalMeshReferenceStatus = "resolvable" | "unresolved" | "external";
export type LocalMeshReferenceInspection = ReturnType<typeof parseMeshReference> & {
    status: LocalMeshReferenceStatus;
    element: "visual" | "collision" | "unknown";
    linkName?: string;
    resolvedPath: string | null;
    normalizedReference: string | null;
    needsNormalization: boolean;
};
export type LocalMeshReferenceReport = {
    count: number;
    packageName: string | null;
    packageRoot: string | null;
    packageXmlPath: string | null;
    detectedMeshFolders: string[];
    summary: {
        resolvable: number;
        unresolved: number;
        external: number;
        normalizable: number;
    };
    refs: LocalMeshReferenceInspection[];
};
export type FixLocalMeshPathsResult = {
    urdfContent: string;
    corrections: PathCorrection[];
    unresolved: string[];
    packageName: string;
};
export declare const discoverLocalPackageContext: (urdfPath: string, explicitPackageName?: string) => LocalPackageContext;
export declare const inspectLocalMeshReferences: (urdfPath: string, urdfContent: string, options?: {
    packageName?: string;
}) => LocalMeshReferenceReport;
export declare const fixLocalMeshPaths: (urdfPath: string, urdfContent: string, options?: {
    packageName?: string;
}) => FixLocalMeshPathsResult;
export {};

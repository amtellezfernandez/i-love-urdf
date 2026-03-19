export declare const isSafeMeshPath: (path: string) => boolean;
export declare const normalizeMeshPath: (path: string) => string;
export type MeshReference = {
    raw: string;
    scheme: "package" | "file" | null;
    packageName?: string;
    path: string;
    isAbsoluteFile: boolean;
};
export declare const parseMeshReference: (ref: string) => MeshReference;
export declare const normalizeMeshPathForMatch: (path: string) => string;

export declare const isSafeMeshPath: (path: string) => boolean;
export declare const normalizeMeshPath: (path: string) => string;
export type MeshReference = {
    raw: string;
    scheme: "package" | "file" | null;
    packageName?: string;
    path: string;
    isAbsoluteFile: boolean;
};
export type PackagePathMap = ReadonlyMap<string, string | null | undefined> | Record<string, string | null | undefined>;
export declare const parseMeshReference: (ref: string) => MeshReference;
export declare const normalizeMeshPathForMatch: (path: string) => string;
export declare const resolvePackagePaths: (ref: string, packageMap: PackagePathMap) => string | null;

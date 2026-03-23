export declare const SUPPORTED_MESH_EXTENSIONS: readonly string[];
export declare const SUPPORTED_MESH_RESOURCE_EXTENSIONS: readonly string[];
export declare const extractExtension: (value: string) => string | null;
export declare const extractExtensionWithoutDot: (value: string) => string | null;
export declare const isSupportedMeshExtension: (value: string) => boolean;
export declare const isSupportedMeshResource: (value: string) => boolean;
export declare const meshExtensionsDisplay: () => string;
export declare const describeSupportedMeshExtensions: () => string;
export declare const meshExtensionsAcceptList: () => string;
export type MeshSupportStatus = {
    ok: true;
    extension: string;
} | {
    ok: false;
    extension?: string;
    reason: string;
};
export declare const getMeshSupportStatus: (value: string) => MeshSupportStatus;

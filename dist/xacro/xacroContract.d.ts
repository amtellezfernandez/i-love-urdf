export declare const XACRO_EXPAND_EMPTY_URDF_ERROR = "xacro produced empty output.";
export declare const XACRO_SUPPORT_EXTENSIONS: readonly string[];
export type XacroFilePayload = {
    path: string;
    content_base64: string;
};
export type XacroExpandRequestPayload = {
    target_path: string;
    files: XacroFilePayload[];
    args: Record<string, string>;
    use_inorder: boolean;
};
export type XacroExpandResponsePayload = {
    urdf?: string;
    stderr?: string | null;
    detail?: string;
};
export declare const isXacroSupportPath: (path: string) => boolean;
export declare const isXacroPath: (path: string) => boolean;
export declare const isUrdfXacroPath: (path: string) => boolean;
export declare const normalizeExpandedUrdfPath: (path: string) => string;
export declare const buildXacroFilenameCandidates: (fileName: string) => string[];
export declare const createXacroFilePayloadFromBytes: (path: string, bytes: Uint8Array) => XacroFilePayload;
export declare const createXacroFilePayloadFromText: (path: string, content: string) => XacroFilePayload;
export declare const buildXacroExpandRequestPayload: ({ targetPath, files, args, useInorder, }: {
    targetPath: string;
    files: XacroFilePayload[];
    args?: Record<string, string>;
    useInorder?: boolean;
}) => XacroExpandRequestPayload;
export declare const parseXacroExpandResponsePayload: (payload: XacroExpandResponsePayload, emptyUrdfErrorMessage?: string) => {
    urdf: string;
    stderr?: string | null;
};

export type ReplaceSubrobotOptions = {
    targetRootLink: string;
    replacementUrdfContent: string;
    replacementRootLink: string;
    mountParentLink?: string;
    mountJointName?: string;
    prefix?: string;
    mount?: {
        xyz?: [number, number, number];
        rpy?: [number, number, number];
    };
};
export type ReplaceSubrobotResult = {
    success: boolean;
    content: string;
    removedLinks: string[];
    removedJoints: string[];
    importedLinks: string[];
    importedJoints: string[];
    mountParentLink?: string;
    mountedRootLink?: string;
    mountJointName?: string;
    error?: string;
};
export declare const replaceSubrobotInUrdf: (hostUrdfContent: string, options: ReplaceSubrobotOptions) => ReplaceSubrobotResult;

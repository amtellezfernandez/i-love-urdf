export type UrdfTransformResult = {
    success: boolean;
    content: string;
    error?: string;
    removed?: string[];
};
export declare const removeJointsFromUrdf: (urdfContent: string, jointsToDelete: Iterable<string>) => UrdfTransformResult;
export declare const updateJointLinksInUrdf: (urdfContent: string, jointName: string, parentLink: string, childLink: string) => UrdfTransformResult;
export declare const updateMaterialColorInUrdf: (urdfContent: string, linkName: string, materialName: string, colorHex: string) => UrdfTransformResult;
export declare const updateMeshPathsToAssetsInUrdf: (urdfContent: string) => UrdfTransformResult;

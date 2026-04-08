import type { UrdfTransformResult } from "./urdfTransforms";
export declare const renameJointInUrdf: (urdfContent: string, oldJointName: string, newJointName: string) => UrdfTransformResult;
export declare const renameLinkInUrdf: (urdfContent: string, oldLinkName: string, newLinkName: string) => UrdfTransformResult;
export declare const setJointAxisInUrdf: (urdfContent: string, jointName: string, axis: [number, number, number]) => UrdfTransformResult;
export declare const updateJointOriginInUrdf: (urdfContent: string, jointName: string, xyz: [number, number, number], rpy: [number, number, number]) => UrdfTransformResult;
export declare const updateJointLimitsInUrdf: (urdfContent: string, jointName: string, lowerLimit?: number | null, upperLimit?: number | null) => UrdfTransformResult;
export declare const updateJointVelocityInUrdf: (urdfContent: string, jointName: string, velocity: number | null) => UrdfTransformResult;
export declare const updateJointTypeInUrdf: (urdfContent: string, jointName: string, jointType: string, lowerLimit?: number, upperLimit?: number) => UrdfTransformResult;

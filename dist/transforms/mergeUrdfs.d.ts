import { type AssemblySpec } from "./assemblySpec";
export type MergeUrdfModel = {
    id: string;
    name: string;
    urdfContent: string;
    originX?: number;
    origin?: {
        xyz?: [number, number, number];
        rpy?: [number, number, number];
    };
};
export type AssemblyUrdfModel = MergeUrdfModel;
export type MergeUrdfsOptions = {
    robotName?: string;
    spacing?: number;
};
export type BuildAssemblyUrdfOptions = MergeUrdfsOptions;
export type MergeUrdfsResult = {
    success: boolean;
    content: string;
    robotName: string;
    merged: Array<{
        id: string;
        name: string;
        prefix: string;
        baseLinkName: string;
        mountJointName: string;
    }>;
    error?: string;
};
export type BuildAssemblyUrdfResult = string;
export declare const mergeUrdfs: (models: MergeUrdfModel[], options?: MergeUrdfsOptions) => MergeUrdfsResult;
export declare const mergeAssemblySpec: (spec: AssemblySpec) => MergeUrdfsResult;
export declare const buildAssemblyUrdf: (modelsOrSpec: AssemblyUrdfModel[] | AssemblySpec, options?: BuildAssemblyUrdfOptions) => BuildAssemblyUrdfResult;

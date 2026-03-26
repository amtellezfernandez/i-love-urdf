export type AssemblyPoseLike = {
    x: number;
    y: number;
    z: number;
    yaw: number;
};
export type AssemblyMountOrigin = {
    xyz: [number, number, number];
    rpy: [number, number, number];
};
export type AssemblySpecRobot = {
    id: string;
    name: string;
    urdfContent: string;
    isPrimary?: boolean;
    mount?: AssemblyMountOrigin;
};
export type AssemblySpec = {
    robotName: string;
    robots: AssemblySpecRobot[];
};
export type CreateAssemblySpecModel = {
    id: string;
    name: string;
    urdfContent: string;
    isPrimary?: boolean;
};
export type CreateAssemblySpecOptions = {
    robotName?: string;
    spacing?: number;
    poses?: Record<string, AssemblyPoseLike>;
    primaryRobotId?: string | null;
};
export type AssemblySpecValidationResult = {
    isValid: boolean;
    errors: string[];
};
export declare const createAssemblySpec: (models: CreateAssemblySpecModel[], options?: CreateAssemblySpecOptions) => AssemblySpec;
export declare const validateAssemblySpec: (spec: AssemblySpec) => AssemblySpecValidationResult;

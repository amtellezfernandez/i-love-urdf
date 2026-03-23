import { type LinkData } from "../parsing/parseLinkData";
import { type Vec3 } from "../utils/rotationMath";
export type UsdUpAxis = "Y" | "Z";
export type UsdQuaternion = [number, number, number, number];
export type InlineUsdMesh = {
    triangles: Float32Array;
    sourcePath?: string | null;
};
export type ResolvedUsdMesh = {
    kind: "inline-triangles";
    mesh: InlineUsdMesh;
} | {
    kind: "usd-reference";
    assetPath: string;
} | {
    kind: "unsupported";
    sourcePath?: string | null;
    reason: string;
};
export type UsdMeshResolveRequest = {
    meshRef: string;
    linkName: string;
    geometryName: string;
    kind: "visual" | "collision";
};
export type UsdPrim = {
    name: string;
    typeName: string;
    metadata?: string[];
    properties?: string[];
    children?: UsdPrim[];
};
export type UsdStage = {
    outputPath: string | null;
    defaultPrim: string;
    upAxis: UsdUpAxis;
    metersPerUnit: number;
    kilogramsPerUnit: number;
    rootPrims: UsdPrim[];
    toUsda: () => string;
};
export type CreateUsdStageOptions = {
    defaultPrim?: string;
    upAxis?: UsdUpAxis;
    metersPerUnit?: number;
    kilogramsPerUnit?: number;
    rootPrims?: UsdPrim[];
};
export type UrdfToUsdStats = {
    linksConverted: number;
    jointsConverted: number;
    visualsConverted: number;
    collisionsConverted: number;
    inlineMeshesConverted: number;
    unsupportedMeshes: number;
};
export type ConvertURDFToUSDOptions = {
    defaultPrim?: string;
    robotPrimName?: string;
    upAxis?: UsdUpAxis;
    metersPerUnit?: number;
    kilogramsPerUnit?: number;
    includeVisuals?: boolean;
    includeCollisions?: boolean;
    includeJoints?: boolean;
    meshResolver?: (request: UsdMeshResolveRequest) => ResolvedUsdMesh | null;
};
export type URDFToUSDConversionResult = {
    usdContent: string;
    stage: UsdStage;
    warnings: string[];
    stats: UrdfToUsdStats;
};
export type MapUrdfToUsdPrimOptions = {
    path?: string;
    translation?: Vec3;
    orientation?: UsdQuaternion;
    includeVisuals?: boolean;
    includeCollisions?: boolean;
    meshResolver?: (request: UsdMeshResolveRequest) => ResolvedUsdMesh | null;
};
export type InlineUsdMeshPrimOptions = {
    name: string;
    translation?: Vec3;
    orientation?: UsdQuaternion;
    scale?: Vec3;
    sourcePath?: string | null;
    metadata?: string[];
    additionalProperties?: string[];
};
export declare function createUsdStage(outputPath?: string | null, options?: CreateUsdStageOptions): UsdStage;
export declare function createInlineUsdMeshPrim(mesh: InlineUsdMesh, options: InlineUsdMeshPrimOptions): UsdPrim;
export declare function mapUrdfToUsdPrim(link: LinkData, options?: MapUrdfToUsdPrimOptions): {
    prim: UsdPrim;
    warnings: string[];
    stats: UrdfToUsdStats;
};
export declare function convertURDFToUSD(urdfContent: string, options?: ConvertURDFToUSDOptions): URDFToUSDConversionResult;

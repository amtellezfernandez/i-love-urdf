import type { OriginData } from "../parsing/parseLinkData";
type Vector3 = [number, number, number];
export interface MeshBounds {
    min: Vector3;
    max: Vector3;
    size: Vector3;
    center: Vector3;
    vertices: Float32Array;
}
export type CollisionAutoFitType = "box" | "sphere" | "cylinder" | "capsule";
export type CollisionAutoFitResult = {
    geometryType: "box" | "sphere" | "cylinder";
    geometryParams: Record<string, string>;
    origin: OriginData;
    method: string;
    formula: string;
    warning?: string;
};
type PCAResult = {
    axis: Vector3;
    eigenvalues: Vector3;
    eigenvectors: [Vector3, Vector3, Vector3];
    centroid: Vector3;
};
type CylinderDiagnostics = {
    elongation: number;
    roundness: number;
    outlierRatio: number;
    radialP50: number;
    radialP95: number;
    radialMax: number;
    crossSectionVariation: number;
    eigenvalues: Vector3;
};
type SphereDiagnostics = {
    elongation: number;
    flatness: number;
    isIsotropic: boolean;
    isElongated: boolean;
    isFlat: boolean;
    radialP50: number;
    radialP95: number;
    radialMax: number;
    outlierRatio: number;
    eigenvalues: Vector3;
};
export declare function computeCylinderDiagnostics(vertices: Float32Array, pca: PCAResult): CylinderDiagnostics;
export declare function computeSphereDiagnostics(vertices: Float32Array, pca: PCAResult): SphereDiagnostics;
export declare function fitCylinderPercentilePCA(vertices: Float32Array, pca: PCAResult, diagnostics: CylinderDiagnostics): {
    radius: number;
    height: number;
    center: Vector3;
    axis: Vector3;
};
export declare function fitCylinderConstrainedAxis(vertices: Float32Array, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): {
    radius: number;
    height: number;
    center: Vector3;
    axis: Vector3;
};
export declare function computePCA(vertices: Float32Array): PCAResult | null;
export declare function computeRotationToAxis(targetAxis: Vector3): OriginData;
export declare const autoFitCollisionGeometry: (bounds: MeshBounds, visualOrigin: OriginData, requestedType: CollisionAutoFitType) => CollisionAutoFitResult | null;
export {};

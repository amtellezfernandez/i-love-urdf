/**
 * Parses all visual, collision, and inertial elements from a link
 */
interface GeometryData {
    type: "box" | "sphere" | "cylinder" | "mesh" | null;
    params: Record<string, string>;
}
export interface OriginData {
    xyz: [number, number, number];
    rpy: [number, number, number];
}
export interface VisualData {
    origin: OriginData;
    geometry: GeometryData;
    materialName: string | null;
    materialColor: string | null;
    materialTexture: string | null;
}
export interface CollisionData {
    origin: OriginData;
    geometry: GeometryData;
}
export interface InertialData {
    mass: number;
    origin: OriginData;
    inertia: {
        ixx: number;
        ixy: number;
        ixz: number;
        iyy: number;
        iyz: number;
        izz: number;
    };
}
export interface LinkData {
    name: string;
    visuals: VisualData[];
    collisions: CollisionData[];
    inertial: InertialData | null;
}
export declare function parseLinkData(urdfContent: string, linkName: string): LinkData | null;
export declare function parseLinkDataFromDocument(xmlDoc: Document, linkName: string): LinkData | null;
export {};

export interface MeshFileBounds {
    min: [number, number, number];
    max: [number, number, number];
    vertexCount: number;
    format: "stl" | "obj" | "dae";
}
export declare function readObjBounds(filePath: string): MeshFileBounds;
export declare function readDaeBounds(filePath: string): MeshFileBounds;
export declare function readMeshBounds(filePath: string): MeshFileBounds;

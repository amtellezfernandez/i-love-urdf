export declare const DEFAULT_STL_FACE_BUDGET = 200000;
export declare const DEFAULT_MESH_COMPRESSION_MAX_FACES = 200000;
export interface MeshPrepOptions {
    meshDir: string;
    maxFaces?: number;
    inPlace?: boolean;
    outDir?: string;
    meshes?: string[];
    limits?: Record<string, number>;
}
export interface MeshPrepResultEntry {
    path: string;
    format: string;
    faceCountBefore: number;
    faceCountAfter: number;
    changed: boolean;
    divisions: number | null;
    reason: string | null;
}
export interface MeshPrepResult {
    meshDir: string;
    targetDir: string | null;
    maxFaces: number;
    inspected: number;
    overLimit: number;
    rewritten: number;
    results: MeshPrepResultEntry[];
}
export type CompressMeshesOptions = MeshPrepOptions;
export type CompressMeshesResultEntry = MeshPrepResultEntry;
export type CompressMeshesResult = MeshPrepResult;
export interface InspectMeshesOptions {
    meshDir: string;
    maxFaces?: number;
    meshes?: string[];
    limits?: Record<string, number>;
}
export interface InspectMeshesResultEntry {
    path: string;
    format: string;
    faceCount: number;
    byteLength: number;
    isBinary: boolean;
    targetMaxFaces: number;
    overLimit: boolean;
    reason: string | null;
}
export interface InspectMeshesResult {
    meshDir: string;
    maxFaces: number;
    inspected: number;
    matched: number;
    overLimit: number;
    requestedMeshes: string[];
    missingMeshes: string[];
    results: InspectMeshesResultEntry[];
}
export declare function inspectMeshes(options: InspectMeshesOptions): InspectMeshesResult;
export declare function compressMeshes(options: CompressMeshesOptions): CompressMeshesResult;

export declare const DEFAULT_MUJOCO_MAX_STL_FACES = 200000;
export declare const DEFAULT_MESH_COMPRESSION_MAX_FACES = 200000;
export interface MujocoMeshPrepOptions {
    meshDir: string;
    maxFaces?: number;
    inPlace?: boolean;
    outDir?: string;
    meshes?: string[];
    limits?: Record<string, number>;
}
export interface MujocoMeshPrepResultEntry {
    path: string;
    format: string;
    faceCountBefore: number;
    faceCountAfter: number;
    changed: boolean;
    divisions: number | null;
    reason: string | null;
}
export interface MujocoMeshPrepResult {
    meshDir: string;
    targetDir: string | null;
    maxFaces: number;
    inspected: number;
    overLimit: number;
    rewritten: number;
    results: MujocoMeshPrepResultEntry[];
}
export type CompressMeshesOptions = MujocoMeshPrepOptions;
export type CompressMeshesResultEntry = MujocoMeshPrepResultEntry;
export type CompressMeshesResult = MujocoMeshPrepResult;
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

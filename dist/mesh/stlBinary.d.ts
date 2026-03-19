export interface BinaryStlMetadata {
    faceCount: number;
    byteLength: number;
    isBinary: boolean;
}
export interface BinaryStlMesh extends BinaryStlMetadata {
    header: Buffer;
    triangles: Float32Array;
}
export interface SimplifiedBinaryStl {
    divisions: number;
    faceCount: number;
    triangles: Float32Array;
}
export declare function inspectBinaryStlBuffer(buffer: Buffer): BinaryStlMetadata;
export declare function inspectBinaryStlFile(filePath: string): BinaryStlMetadata;
export declare function readBinaryStl(filePath: string): BinaryStlMesh;
export declare function simplifyBinaryStlTriangles(triangles: Float32Array, divisions: number): Float32Array;
export declare function chooseSimplifiedBinaryStl(triangles: Float32Array, maxFaces: number, candidateDivisions?: number[]): SimplifiedBinaryStl;
export declare function writeBinaryStl(filePath: string, header: Buffer, triangles: Float32Array): void;

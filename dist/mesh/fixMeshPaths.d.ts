/**
 * Mesh Path Fixing Utility for URDF
 *
 * Detects and fixes common issues with mesh file paths:
 * - Absolute paths (/home/user/.../mesh.stl)
 * - Windows-style paths (meshes\part.stl)
 * - Paths with unnecessary .. segments
 * - Non-standard package paths
 *
 * Normalizes to standard ROS package:// format
 */
export interface PathFixResult {
    urdfContent: string;
    corrections: PathCorrection[];
    packageName: string;
}
export interface PathCorrection {
    element: string;
    linkName: string;
    original: string;
    corrected: string;
    reason: string;
}
export interface FixMeshPathsOptions {
    packageName?: string;
    convertRelativeToPackage?: boolean;
}
/**
 * Fixes mesh paths in a URDF to use proper package:// format
 *
 * @param urdfContent - URDF XML content as string
 * @param packageName - Optional package name to use (auto-detected if not provided)
 * @returns Result with corrected URDF and list of corrections
 */
export declare function fixMeshPaths(urdfContent: string, packageNameOrOptions?: string | FixMeshPathsOptions): PathFixResult;
export declare function fixMeshPathsInternal(urdfContent: string, packageNameOrOptions?: string | FixMeshPathsOptions): PathFixResult;
/**
 * Convenience wrapper that returns only the corrected URDF string.
 *
 * @param urdfContent - URDF XML content as string
 * @param packageName - Optional package name to use
 * @returns Corrected URDF content
 */

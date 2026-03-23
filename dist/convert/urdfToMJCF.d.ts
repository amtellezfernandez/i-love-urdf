/**
 * URDF to MJCF converter.
 *
 * Converts URDF robot descriptions to MJCF.
 * Based on the structure used by urdf2mjcf (https://github.com/kscalelabs/urdf2mjcf)
 */
export interface MJCFConversionResult {
    mjcfContent: string;
    warnings: string[];
    stats: {
        bodiesCreated: number;
        jointsConverted: number;
        geometriesConverted: number;
    };
}
/**
 * Converts URDF to MJCF format
 */
export declare function convertURDFToMJCF(urdfContent: string): MJCFConversionResult;

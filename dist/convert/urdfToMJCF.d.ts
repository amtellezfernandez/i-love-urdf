/**
 * URDF to MJCF converter.
 *
 * Converts URDF robot descriptions to MJCF.
 * Based on the structure used by urdf2mjcf (https://github.com/kscalelabs/urdf2mjcf)
 */
export interface MJCFConversionResult {
    mjcfContent: string;
    warnings: string[];
    diagnostics: MJCFConversionDiagnostic[];
    stats: {
        bodiesCreated: number;
        jointsConverted: number;
        geometriesConverted: number;
    };
}
export interface ConvertURDFToMJCFOptions {
    includeSimulationDefaults?: boolean;
    includeActuators?: boolean;
}
export interface MJCFConversionDiagnostic {
    code: "mjcf.inertial.omitted_frame" | "mjcf.inertial.regularized" | "mjcf.mesh.name_collision";
    severity: "warning";
    linkName: string;
    message: string;
}
/**
 * Converts URDF to MJCF format
 */
export declare function convertURDFToMJCF(urdfContent: string, options?: ConvertURDFToMJCFOptions): MJCFConversionResult;

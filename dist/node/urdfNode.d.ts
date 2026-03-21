export type KinematicFingerprint = {
    strict: string;
    loose: string;
};
export type ComputeKinematicFingerprintOptions = {
    quantizationDecimals?: number;
};
export declare const stripUrdfForKinematics: (urdfXml: string) => string;
export declare const computeKinematicFingerprint: (urdfXml: string, options?: ComputeKinematicFingerprintOptions) => KinematicFingerprint;
export declare const computeSha256Text: (value: string) => string;
export * from "./loadedSourceAnalysis";
export * from "./urdfUsdNode";

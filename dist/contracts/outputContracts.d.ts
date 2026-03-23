export declare const OUTPUT_SCHEMA_VERSION: "1.0.0";
export declare const ORIENTATION_GUESS_CONTRACT: {
    readonly schema: "i-love-urdf/orientation-guess";
    readonly schemaVersion: "1.0.0";
};
export declare const ROBOT_ORIENTATION_CARD_CONTRACT: {
    readonly schema: "i-love-urdf/robot-orientation-card";
    readonly schemaVersion: "1.0.0";
};
export declare const ROBOT_MORPHOLOGY_CARD_CONTRACT: {
    readonly schema: "i-love-urdf/robot-morphology-card";
    readonly schemaVersion: "1.0.0";
};
export declare const HEALTH_CHECK_REPORT_CONTRACT: {
    readonly schema: "i-love-urdf/health-check-report";
    readonly schemaVersion: "1.0.0";
};
export declare const OUTPUT_CONTRACTS: {
    readonly orientationGuess: {
        readonly schema: "i-love-urdf/orientation-guess";
        readonly schemaVersion: "1.0.0";
    };
    readonly robotOrientationCard: {
        readonly schema: "i-love-urdf/robot-orientation-card";
        readonly schemaVersion: "1.0.0";
    };
    readonly robotMorphologyCard: {
        readonly schema: "i-love-urdf/robot-morphology-card";
        readonly schemaVersion: "1.0.0";
    };
    readonly healthCheckReport: {
        readonly schema: "i-love-urdf/health-check-report";
        readonly schemaVersion: "1.0.0";
    };
};
export type OutputSchemaVersion = typeof OUTPUT_SCHEMA_VERSION;
export type OutputContract<TSchema extends string> = {
    schema: TSchema;
    schemaVersion: OutputSchemaVersion;
};
export declare const withOutputContract: <TSchema extends string, TPayload extends Record<string, unknown>>(contract: OutputContract<TSchema>, payload: TPayload) => OutputContract<TSchema> & TPayload;

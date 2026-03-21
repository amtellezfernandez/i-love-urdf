export const OUTPUT_SCHEMA_VERSION = "1.0.0" as const;

const defineOutputContract = <TSchema extends string>(schema: TSchema) =>
  ({
    schema,
    schemaVersion: OUTPUT_SCHEMA_VERSION,
  }) as const;

export const ORIENTATION_GUESS_CONTRACT = defineOutputContract(
  "i-love-urdf/orientation-guess"
);

export const ROBOT_ORIENTATION_CARD_CONTRACT = defineOutputContract(
  "i-love-urdf/robot-orientation-card"
);

export const ROBOT_MORPHOLOGY_CARD_CONTRACT = defineOutputContract(
  "i-love-urdf/robot-morphology-card"
);

export const HEALTH_CHECK_REPORT_CONTRACT = defineOutputContract(
  "i-love-urdf/health-check-report"
);

export const OUTPUT_CONTRACTS = {
  orientationGuess: ORIENTATION_GUESS_CONTRACT,
  robotOrientationCard: ROBOT_ORIENTATION_CARD_CONTRACT,
  robotMorphologyCard: ROBOT_MORPHOLOGY_CARD_CONTRACT,
  healthCheckReport: HEALTH_CHECK_REPORT_CONTRACT,
} as const;

export type OutputSchemaVersion = typeof OUTPUT_SCHEMA_VERSION;

export type OutputContract<TSchema extends string> = {
  schema: TSchema;
  schemaVersion: OutputSchemaVersion;
};

export const withOutputContract = <
  TSchema extends string,
  TPayload extends Record<string, unknown>,
>(
  contract: OutputContract<TSchema>,
  payload: TPayload
): OutputContract<TSchema> & TPayload => ({
  ...contract,
  ...payload,
});

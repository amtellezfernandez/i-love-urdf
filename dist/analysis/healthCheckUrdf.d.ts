import { guessUrdfOrientation } from "./guessOrientation";
import { HEALTH_CHECK_REPORT_CONTRACT } from "../contracts/outputContracts";
export type HealthCheckLevel = "error" | "warning" | "info";
export interface HealthCheckFinding {
    level: HealthCheckLevel;
    code: string;
    message: string;
    context?: string;
    suggestion?: string;
}
export interface HealthCheckOptions {
    axisSnapTolerance?: number;
    includeOrientation?: boolean;
}
export interface HealthCheckReport {
    schema: typeof HEALTH_CHECK_REPORT_CONTRACT.schema;
    schemaVersion: typeof HEALTH_CHECK_REPORT_CONTRACT.schemaVersion;
    ok: boolean;
    findings: HealthCheckFinding[];
    summary: {
        errors: number;
        warnings: number;
        infos: number;
    };
    orientationGuess?: ReturnType<typeof guessUrdfOrientation>;
}
export declare function healthCheckUrdf(urdfContent: string, options?: HealthCheckOptions): HealthCheckReport;

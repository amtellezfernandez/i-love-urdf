import { guessUrdfOrientation } from "./guessOrientation";
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

import type { RepositoryPreviewCandidate, ShellState, SuggestedActionPrompt } from "./cliShellTypes";
export declare const buildRepairMeshRefsSuggestion: () => SuggestedActionPrompt;
export declare const buildFixMeshPathsSuggestion: () => SuggestedActionPrompt;
export declare const buildReviewAttentionSuggestion: () => SuggestedActionPrompt;
export declare const formatAttentionDetail: (message: string, context?: string) => string;
export declare const appendSuggestedActionLines: (lines: string[], suggestedAction: SuggestedActionPrompt | null, fallbackLine: string) => void;
export declare const getValidationStatusLine: (payload: {
    isValid: boolean;
    issues: Array<{
        level: "error" | "warning";
        message: string;
        context?: string;
    }>;
}) => string;
export declare const getHealthStatusLine: (payload: {
    ok: boolean;
    summary: {
        errors: number;
        warnings: number;
        infos: number;
    };
}) => string;
export declare const collectAttentionLines: (validationIssues?: Array<{
    level: "error" | "warning";
    message: string;
    context?: string;
}>, healthFindings?: Array<{
    level: "error" | "warning" | "info";
    message: string;
    context?: string;
}>, limit?: number) => string[];
export declare const hasAttentionIssues: (payload: {
    validation: {
        isValid: boolean;
        issues: Array<{
            level: "error" | "warning";
            message: string;
            context?: string;
        }>;
    };
    health: {
        summary: {
            errors: number;
            warnings: number;
            infos: number;
        };
    };
}) => boolean;
export declare const detectSuggestedAction: (state: Pick<ShellState, "loadedSource" | "lastUrdfPath">, options?: {
    selectedCandidate?: RepositoryPreviewCandidate;
    urdfPath?: string;
}) => SuggestedActionPrompt | null;
export declare const getCandidateDetails: (candidate: RepositoryPreviewCandidate) => string[];

export type UrdfValidationIssue = {
    level: "error" | "warning";
    message: string;
    context?: string;
};
export type UrdfValidationResult = {
    isValid: boolean;
    issues: UrdfValidationIssue[];
};
export declare const validateUrdf: (urdfContent: string) => UrdfValidationResult;

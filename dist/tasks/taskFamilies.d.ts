export type TaskFamilyKey = "load" | "health" | "validate" | "analyze" | "format" | "edit" | "normalize" | "optimize" | "convert";
export type TaskFamilyDefinition = {
    key: TaskFamilyKey;
    title: string;
    summary: string;
    commands: readonly string[];
};
export declare const TASK_FAMILIES: readonly TaskFamilyDefinition[];

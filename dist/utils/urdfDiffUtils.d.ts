export interface UrdfComparisonResult {
    normalizedOriginal: string;
    normalizedModified: string;
    areEqual: boolean;
    differenceCount: number;
}
export declare const compareUrdfs: (original: string, modified: string) => UrdfComparisonResult;

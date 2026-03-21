export type UrdfParseStats = {
    isValid: boolean;
    error?: string | null;
    links: number;
    joints: number;
    materials: number;
    robotName?: string;
};
export declare const parseUrdfStats: (xml: string) => UrdfParseStats;

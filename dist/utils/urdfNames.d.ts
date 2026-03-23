export declare const sanitizeUrdfName: (name: string, allowHyphen?: boolean) => string;
export type SanitizeNamesOptions = {
    allowHyphen?: boolean;
    lowerCase?: boolean;
};
export declare const sanitizeNames: (name: string, options?: SanitizeNamesOptions) => string;

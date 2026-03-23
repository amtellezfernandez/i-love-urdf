export type ExtensionSupport = {
    primaryExtensions: readonly string[];
    supportedExtensions: readonly string[];
    extractExtension: (value: string) => string | null;
    isPrimarySupported: (value: string) => boolean;
    isSupported: (value: string) => boolean;
    describePrimary: () => string;
    primaryAcceptList: () => string;
};
export declare const createExtensionSupport: (params: {
    primaryExtensions?: string[];
    additionalExtensions?: string[];
}) => ExtensionSupport;

export declare const getHomeDirectory: (env?: NodeJS.ProcessEnv) => string;
export declare const decodeShellEscapes: (value: string) => string;
export declare const stripMatchingQuotes: (value: string) => string;
export declare const normalizeShellInput: (rawValue: string) => string;
export declare const expandHomePath: (value: string, env?: NodeJS.ProcessEnv) => string;
export declare const normalizeFilesystemInput: (rawValue: string, env?: NodeJS.ProcessEnv) => string;
export declare const isWindowsAbsolutePath: (value: string) => boolean;

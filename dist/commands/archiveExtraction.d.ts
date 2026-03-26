export declare const MAX_ARCHIVE_ENTRY_COUNT = 5000;
export declare const MAX_ARCHIVE_ENTRY_BYTES: number;
export declare const MAX_ARCHIVE_TOTAL_BYTES: number;
export type ExtractZipArchiveOptions = {
    tempDir?: string;
    maxEntries?: number;
    maxEntryBytes?: number;
    maxTotalBytes?: number;
};
export type ExtractZipArchiveResult = {
    archiveRoot: string;
    workingPath: string;
};
export type ZipArchiveMetadata = {
    compressedBytes: number;
    expandedBytes: number;
    entryCount: number;
};
export declare const sanitizeArchiveEntryPath: (entryName: string) => string;
export declare const extractZipArchiveToTempRoot: (archivePath: string, options?: ExtractZipArchiveOptions) => ExtractZipArchiveResult;
export declare const inspectZipArchiveMetadata: (archivePath: string) => ZipArchiveMetadata;

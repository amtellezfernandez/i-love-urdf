export type ThumbnailCaptureResult = {
    captured: boolean;
    outputPath: string | null;
    reviewUrl: string;
    skippedReason?: string;
};
export declare class StudioThumbnailClient {
    private handle;
    private startupError;
    private readonly chromeBinary;
    constructor();
    captureSharedSessionThumbnail(sessionId: string, outputPath: string): Promise<ThumbnailCaptureResult>;
    close(): void;
}

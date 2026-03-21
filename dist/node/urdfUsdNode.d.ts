import { type ConvertURDFToUSDOptions, type URDFToUSDConversionResult, type UsdStage } from "../convert/urdfToUSD";
import { type LoadSourcePathOptions, type LoadSourceResult } from "../sources/loadSourceNode";
export type MeshUsdConversionResult = {
    sourcePath: string;
    usdPath: string;
    usdContent: string | null;
    wroteFile: boolean;
    warnings: string[];
    stage?: UsdStage;
};
export type ConvertLoadedSourceToUSDOptions = ConvertURDFToUSDOptions & {
    outputPath?: string;
    rootPath?: string;
};
export type ConvertLocalSourcePathToUSDOptions = LoadSourcePathOptions & ConvertLoadedSourceToUSDOptions;
export type LoadedSourceUSDConversionResult = URDFToUSDConversionResult & {
    outputPath: string | null;
    rootPath: string | null;
    entryPath: string | null;
};
export declare function convertMeshToUsd(meshPath: string, options?: {
    outPath?: string;
    upAxis?: "Y" | "Z";
    metersPerUnit?: number;
    kilogramsPerUnit?: number;
    write?: boolean;
}): MeshUsdConversionResult;
export declare function convertLoadedSourceToUSD(source: LoadSourceResult, options?: ConvertLoadedSourceToUSDOptions): Promise<LoadedSourceUSDConversionResult>;
export declare function convertURDFPathToUSD(urdfPath: string, options?: ConvertLoadedSourceToUSDOptions): Promise<LoadedSourceUSDConversionResult>;
export declare function convertLocalSourcePathToUSD(options: ConvertLocalSourcePathToUSDOptions): Promise<LoadedSourceUSDConversionResult>;

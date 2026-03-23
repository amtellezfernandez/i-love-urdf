/**
 * URDF to Xacro Converter
 *
 * Automatically converts static URDF to parametric Xacro format by:
 * - Detecting repeated values and creating properties
 * - Identifying repeated structures and generating macros
 * - Substituting values with ${...} expressions
 */
interface XacroProperty {
    name: string;
    value: string;
    count: number;
    contexts: string[];
}
interface XacroMacro {
    name: string;
    params: string[];
    template: string;
    instances: MacroInstance[];
}
interface MacroInstance {
    originalElement: Element;
    paramValues: Record<string, string>;
}
export interface ConversionResult {
    xacroContent: string;
    properties: XacroProperty[];
    macros: XacroMacro[];
    stats: {
        propertiesGenerated: number;
        macrosGenerated: number;
        valuesParameterized: number;
    };
}
/**
 * Converts URDF to Xacro format
 */
export declare function convertURDFToXacro(urdfContent: string): ConversionResult;
export {};

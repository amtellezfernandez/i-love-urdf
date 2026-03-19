/**
 * Robust URDF XML Parser Utility
 *
 * All URDF parsing should go through this utility so Node and browser
 * environments behave consistently.
 */
export interface ParsedURDF {
    document: Document;
    isValid: boolean;
    error?: string;
}
/**
 * Parses URDF XML content using DOMParser
 * @param urdfContent URDF XML content as string
 * @returns Parsed document with validation status
 */
export declare function parseURDF(urdfContent: string): ParsedURDF;
/**
 * Serializes a parsed URDF document back to XML string
 * @param document Parsed XML document
 * @returns XML string representation
 */
export declare function serializeURDF(document: Document): string;
/**
 * Helper function to safely parse URDF and execute a callback with the parsed document
 * @param urdfContent URDF XML content as string
 * @param callback Function to execute with parsed document
 * @param fallback Fallback value if parsing fails
 * @returns Result of callback or fallback
 */

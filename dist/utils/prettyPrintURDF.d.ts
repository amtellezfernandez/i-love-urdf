/**
 * Pretty Print Utility for URDF
 *
 * Formats URDF XML with consistent indentation and clean structure.
 * Converts messy or minified XML into human-readable format.
 */
/**
 * Pretty prints URDF content with consistent indentation
 *
 * @param urdfContent - URDF XML content as string
 * @param indentSize - Number of spaces for each indent level (default: 2)
 * @returns Formatted URDF with proper indentation
 */
export declare function prettyPrintURDF(urdfContent: string, indentSize?: number): string;

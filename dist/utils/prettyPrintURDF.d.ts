/**
 * URDF pretty-printing utility.
 *
 * Formats URDF XML with consistent indentation and structure.
 * Converts unformatted or minified XML into a readable representation.
 */
/**
 * Pretty-prints URDF content with consistent indentation.
 *
 * @param urdfContent - URDF XML content as string
 * @param indentSize - Number of spaces for each indent level (default: 2)
 * @returns Formatted URDF with proper indentation
 */
export declare function prettyPrintURDF(urdfContent: string, indentSize?: number): string;

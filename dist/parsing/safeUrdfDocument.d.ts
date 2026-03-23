export type PlainUrdfDocumentIssue = "empty" | "oversize" | "xacro" | "parse" | "robot-missing" | "depth";
export type ParsePlainUrdfDocumentOptions = {
    maxBytes?: number;
    maxDepth?: number;
    rejectXacro?: boolean;
};
export type ParsePlainUrdfDocumentResult = {
    success: boolean;
    document: XMLDocument | null;
    error?: string;
    issue?: PlainUrdfDocumentIssue;
};
export declare const hasXacroSyntax: (content: string) => boolean;
export declare const findNamedUrdfElement: (xmlDoc: XMLDocument, tagName: string, elementName: string) => Element | null;
export declare const parsePlainUrdfDocument: (urdfContent: string, options?: ParsePlainUrdfDocumentOptions) => ParsePlainUrdfDocumentResult;

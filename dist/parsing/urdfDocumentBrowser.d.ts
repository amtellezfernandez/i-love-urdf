export type UrdfParseOptions = {
    onParseError?: (message: string) => void;
    onRobotMissing?: () => void;
    onXacroDetected?: (message: string) => void;
    onOversize?: (message: string) => void;
    onDepthExceeded?: (message: string) => void;
};
export type UrdfElementLookupOptions = {
    label?: string;
    onMissing?: (message: string) => void;
};
export declare function parseUrdfDocument(urdfContent: string, options?: UrdfParseOptions): XMLDocument | null;
export declare function getUrdfElementByName(xmlDoc: XMLDocument, tagName: string, elementName: string, options?: UrdfElementLookupOptions): Element | null;
export declare function serializeUrdfDocument(xmlDoc: XMLDocument): string;

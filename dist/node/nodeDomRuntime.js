"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeNodeXmlDocument = exports.parseNodeXmlDocument = exports.installNodeDomGlobals = void 0;
const linkedom_1 = require("linkedom");
const saxes_1 = require("saxes");
const XML_DECLARATION_PATTERN = /^<\?xml[^>]*\?>/i;
const escapeXmlText = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const normalizeSerializedXml = (value) => value.replace(XML_DECLARATION_PATTERN, "").replace(/ \/>/g, "/>");
const getXmlValidationError = (xml) => {
    try {
        const parser = new saxes_1.SaxesParser({ xmlns: false });
        parser.write(xml).close();
        return null;
    }
    catch (error) {
        if (error instanceof Error) {
            return error.message.split("\n")[0] || "Invalid XML";
        }
        return "Invalid XML";
    }
};
class NodeXmlDomParser {
    parseFromString(xml, mimeType) {
        const validationError = getXmlValidationError(xml);
        const parser = new linkedom_1.DOMParser();
        const normalizedMimeType = mimeType.includes("html")
            ? "text/html"
            : mimeType.includes("svg")
                ? "image/svg+xml"
                : "text/xml";
        if (validationError) {
            const parserErrorXml = `<parsererror>${escapeXmlText(validationError)}</parsererror>`;
            return parser.parseFromString(parserErrorXml, normalizedMimeType);
        }
        return parser.parseFromString(xml, normalizedMimeType);
    }
}
class NodeXmlSerializer {
    serializeToString(node) {
        const serializable = node;
        if (serializable.nodeType === 9 && serializable.documentElement?.toString) {
            const serialized = normalizeSerializedXml(serializable.documentElement.toString());
            const rootTagMatch = serialized.match(/^<([A-Za-z_][\w:.-]*)([^>]*)\/>$/);
            if (rootTagMatch) {
                const [, tagName, attrs] = rootTagMatch;
                return `<${tagName}${attrs}></${tagName}>`;
            }
            return serialized;
        }
        if (typeof serializable.toString === "function") {
            return normalizeSerializedXml(serializable.toString());
        }
        return "";
    }
}
const installNodeDomGlobals = () => {
    if (typeof globalThis.DOMParser === "undefined") {
        globalThis.DOMParser = NodeXmlDomParser;
    }
    if (typeof globalThis.XMLSerializer === "undefined") {
        globalThis.XMLSerializer = NodeXmlSerializer;
    }
};
exports.installNodeDomGlobals = installNodeDomGlobals;
const parseNodeXmlDocument = (xml, mimeType = "application/xml") => new NodeXmlDomParser().parseFromString(xml, mimeType);
exports.parseNodeXmlDocument = parseNodeXmlDocument;
const serializeNodeXmlDocument = (document) => new NodeXmlSerializer().serializeToString(document);
exports.serializeNodeXmlDocument = serializeNodeXmlDocument;

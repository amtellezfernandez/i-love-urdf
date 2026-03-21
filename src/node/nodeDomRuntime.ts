import { DOMParser as LinkedomDOMParser } from "linkedom";
import { SaxesParser } from "saxes";

const XML_DECLARATION_PATTERN = /^<\?xml[^>]*\?>/i;

const escapeXmlText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const normalizeSerializedXml = (value: string): string =>
  value.replace(XML_DECLARATION_PATTERN, "").replace(/ \/>/g, "/>");

const getXmlValidationError = (xml: string): string | null => {
  try {
    const parser = new SaxesParser({ xmlns: false });
    parser.write(xml).close();
    return null;
  } catch (error) {
    if (error instanceof Error) {
      return error.message.split("\n")[0] || "Invalid XML";
    }
    return "Invalid XML";
  }
};

class NodeXmlDomParser {
  parseFromString(xml: string, mimeType: string): Document {
    const validationError = getXmlValidationError(xml);
    const parser = new LinkedomDOMParser();
    const normalizedMimeType: "image/svg+xml" | "text/html" | "text/xml" = mimeType.includes("html")
      ? "text/html"
      : mimeType.includes("svg")
        ? "image/svg+xml"
        : "text/xml";

    if (validationError) {
      const parserErrorXml = `<parsererror>${escapeXmlText(validationError)}</parsererror>`;
      return parser.parseFromString(parserErrorXml, normalizedMimeType) as unknown as Document;
    }

    return parser.parseFromString(xml, normalizedMimeType) as unknown as Document;
  }
}

class NodeXmlSerializer {
  serializeToString(node: Node): string {
    const serializable = node as Node & {
      documentElement?: { toString?: () => string } | null;
      toString?: () => string;
    };

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

export const installNodeDomGlobals = () => {
  if (typeof globalThis.DOMParser === "undefined") {
    globalThis.DOMParser = NodeXmlDomParser as unknown as typeof DOMParser;
  }
  if (typeof globalThis.XMLSerializer === "undefined") {
    globalThis.XMLSerializer = NodeXmlSerializer as unknown as typeof XMLSerializer;
  }
};

export const parseNodeXmlDocument = (
  xml: string,
  mimeType = "application/xml"
): Document => new NodeXmlDomParser().parseFromString(xml, mimeType);

export const serializeNodeXmlDocument = (document: Document): string =>
  new NodeXmlSerializer().serializeToString(document as unknown as Node);

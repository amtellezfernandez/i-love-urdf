import { DOMParser as LinkedomDOMParser } from "linkedom";
import { SaxesParser } from "saxes";

const XML_DECLARATION_PATTERN = /^<\?xml[^>]*\?>/i;

const escapeXmlText = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const normalizeSerializedXml = (value) =>
  value.replace(XML_DECLARATION_PATTERN, "").replace(/ \/>/g, "/>");

const getXmlValidationError = (xml) => {
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
  parseFromString(xml, mimeType) {
    const validationError = getXmlValidationError(xml);
    const parser = new LinkedomDOMParser();
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
    if (node?.nodeType === 9 && typeof node.documentElement?.toString === "function") {
      const serialized = normalizeSerializedXml(node.documentElement.toString());
      const rootTagMatch = serialized.match(/^<([A-Za-z_][\w:.-]*)([^>]*)\/>$/);
      if (rootTagMatch) {
        const [, tagName, attrs] = rootTagMatch;
        return `<${tagName}${attrs}></${tagName}>`;
      }
      return serialized;
    }
    if (typeof node?.toString === "function") {
      return normalizeSerializedXml(node.toString());
    }
    return "";
  }
}

export const installDomGlobals = () => {
  if (typeof globalThis.DOMParser === "undefined") {
    globalThis.DOMParser = NodeXmlDomParser;
  }
  if (typeof globalThis.XMLSerializer === "undefined") {
    globalThis.XMLSerializer = NodeXmlSerializer;
  }
};

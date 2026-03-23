import { parseURDF } from "./urdfParser";

export type PlainUrdfDocumentIssue =
  | "empty"
  | "oversize"
  | "xacro"
  | "parse"
  | "robot-missing"
  | "depth";

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

const countUtf8Bytes = (content: string): number => new TextEncoder().encode(content).length;

const getXmlDepth = (node: Element, depth: number, maxDepth: number): number => {
  if (depth > maxDepth) return depth;
  let max = depth;
  for (const child of Array.from(node.children)) {
    const childDepth = getXmlDepth(child, depth + 1, maxDepth);
    if (childDepth > max) {
      max = childDepth;
    }
    if (max > maxDepth) {
      return max;
    }
  }
  return max;
};

export const hasXacroSyntax = (content: string): boolean => {
  if (!content) return false;
  const lower = content.toLowerCase();
  if (lower.includes("xmlns:xacro")) return true;
  if (lower.includes("<xacro:")) return true;
  return /\$\{[^}]+\}/.test(content);
};

export const findNamedUrdfElement = (
  xmlDoc: XMLDocument,
  tagName: string,
  elementName: string
): Element | null => xmlDoc.querySelector(`${tagName}[name="${elementName}"]`);

export const parsePlainUrdfDocument = (
  urdfContent: string,
  options: ParsePlainUrdfDocumentOptions = {}
): ParsePlainUrdfDocumentResult => {
  if (!urdfContent.trim()) {
    return {
      success: false,
      document: null,
      error: "Empty URDF",
      issue: "empty",
    };
  }

  if (
    Number.isFinite(options.maxBytes) &&
    countUtf8Bytes(urdfContent) > Number(options.maxBytes)
  ) {
    return {
      success: false,
      document: null,
      error: `URDF content exceeds ${Math.round(Number(options.maxBytes) / (1024 * 1024))} MB`,
      issue: "oversize",
    };
  }

  if (options.rejectXacro && hasXacroSyntax(urdfContent)) {
    return {
      success: false,
      document: null,
      error: "XACRO content detected; expected plain URDF XML",
      issue: "xacro",
    };
  }

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    const issue = parsed.error?.includes("No <robot> element found") ? "robot-missing" : "parse";
    return {
      success: false,
      document: null,
      error: parsed.error ?? "Invalid URDF",
      issue,
    };
  }

  if (Number.isFinite(options.maxDepth)) {
    const xmlDoc = parsed.document as XMLDocument;
    const depth = getXmlDepth(xmlDoc.documentElement, 1, Number(options.maxDepth));
    if (depth > Number(options.maxDepth)) {
      return {
        success: false,
        document: null,
        error: `URDF depth exceeds ${Number(options.maxDepth)} levels`,
        issue: "depth",
      };
    }
  }

  return {
    success: true,
    document: parsed.document as XMLDocument,
  };
};

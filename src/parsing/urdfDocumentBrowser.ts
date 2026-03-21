import {
  findNamedUrdfElement,
  parsePlainUrdfDocument,
} from "./safeUrdfDocument";
import { serializeURDF } from "./urdfParser";

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

export function parseUrdfDocument(
  urdfContent: string,
  options: UrdfParseOptions = {}
): XMLDocument | null {
  const result = parsePlainUrdfDocument(urdfContent, {
    maxBytes: 5 * 1024 * 1024,
    maxDepth: 100,
    rejectXacro: true,
  });
  if (result.success && result.document) {
    return result.document;
  }

  switch (result.issue) {
    case "oversize": {
      const onOversize =
        options.onOversize ??
        ((message: string) => console.warn("URDF size limit exceeded:", message));
      onOversize(result.error ?? "URDF content exceeds the configured size limit");
      return null;
    }
    case "xacro": {
      const onXacroDetected =
        options.onXacroDetected ??
        ((message: string) => console.warn("XACRO detected:", message));
      onXacroDetected(result.error ?? "XACRO content detected; expected plain URDF XML");
      return null;
    }
    case "robot-missing": {
      const onRobotMissing =
        options.onRobotMissing ?? (() => console.error("No <robot> element found in URDF"));
      onRobotMissing();
      return null;
    }
    case "depth": {
      const onDepthExceeded =
        options.onDepthExceeded ??
        ((message: string) => console.warn("URDF depth limit exceeded:", message));
      onDepthExceeded(result.error ?? "URDF depth exceeds the configured limit");
      return null;
    }
    default: {
      const onParseError =
        options.onParseError ?? ((message: string) => console.warn("URDF parsing error:", message));
      onParseError(result.error ?? "Unknown XML parsing error");
      return null;
    }
  }
}

export function getUrdfElementByName(
  xmlDoc: XMLDocument,
  tagName: string,
  elementName: string,
  options: UrdfElementLookupOptions = {}
): Element | null {
  const element = findNamedUrdfElement(xmlDoc, tagName, elementName);
  if (!element) {
    const label = options.label ?? tagName;
    const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const message = `${displayLabel} "${elementName}" not found in URDF.`;
    const onMissing = options.onMissing ?? ((text: string) => console.warn(text));
    onMissing(message);
    return null;
  }
  return element;
}

export function serializeUrdfDocument(xmlDoc: XMLDocument): string {
  return serializeURDF(xmlDoc);
}

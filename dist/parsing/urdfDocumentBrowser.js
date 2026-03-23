"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUrdfDocument = parseUrdfDocument;
exports.getUrdfElementByName = getUrdfElementByName;
exports.serializeUrdfDocument = serializeUrdfDocument;
const safeUrdfDocument_1 = require("./safeUrdfDocument");
const urdfParser_1 = require("./urdfParser");
function parseUrdfDocument(urdfContent, options = {}) {
    const result = (0, safeUrdfDocument_1.parsePlainUrdfDocument)(urdfContent, {
        maxBytes: 5 * 1024 * 1024,
        maxDepth: 100,
        rejectXacro: true,
    });
    if (result.success && result.document) {
        return result.document;
    }
    switch (result.issue) {
        case "oversize": {
            const onOversize = options.onOversize ??
                ((message) => console.warn("URDF size limit exceeded:", message));
            onOversize(result.error ?? "URDF content exceeds the configured size limit");
            return null;
        }
        case "xacro": {
            const onXacroDetected = options.onXacroDetected ??
                ((message) => console.warn("XACRO detected:", message));
            onXacroDetected(result.error ?? "XACRO content detected; expected plain URDF XML");
            return null;
        }
        case "robot-missing": {
            const onRobotMissing = options.onRobotMissing ?? (() => console.error("No <robot> element found in URDF"));
            onRobotMissing();
            return null;
        }
        case "depth": {
            const onDepthExceeded = options.onDepthExceeded ??
                ((message) => console.warn("URDF depth limit exceeded:", message));
            onDepthExceeded(result.error ?? "URDF depth exceeds the configured limit");
            return null;
        }
        default: {
            const onParseError = options.onParseError ?? ((message) => console.warn("URDF parsing error:", message));
            onParseError(result.error ?? "Unknown XML parsing error");
            return null;
        }
    }
}
function getUrdfElementByName(xmlDoc, tagName, elementName, options = {}) {
    const element = (0, safeUrdfDocument_1.findNamedUrdfElement)(xmlDoc, tagName, elementName);
    if (!element) {
        const label = options.label ?? tagName;
        const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
        const message = `${displayLabel} "${elementName}" not found in URDF.`;
        const onMissing = options.onMissing ?? ((text) => console.warn(text));
        onMissing(message);
        return null;
    }
    return element;
}
function serializeUrdfDocument(xmlDoc) {
    return (0, urdfParser_1.serializeURDF)(xmlDoc);
}

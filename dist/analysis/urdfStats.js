"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUrdfStats = void 0;
const countMatches = (pattern, text) => {
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
};
const parseUrdfStats = (xml) => {
    const hasRobotTag = /<robot\b/i.test(xml);
    const hasRobotClose = /<\/robot>/i.test(xml);
    const isValid = hasRobotTag && hasRobotClose;
    const robotNameMatch = xml.match(/<robot\b[^>]*\bname=["']([^"']+)["']/i);
    const robotName = robotNameMatch?.[1] || "Unnamed";
    const links = countMatches(/<link\b/gi, xml);
    const joints = countMatches(/<joint\b/gi, xml);
    const materials = countMatches(/<material\b/gi, xml);
    return {
        isValid,
        error: isValid ? null : "No <robot> element found in URDF",
        links,
        joints,
        materials,
        robotName,
    };
};
exports.parseUrdfStats = parseUrdfStats;

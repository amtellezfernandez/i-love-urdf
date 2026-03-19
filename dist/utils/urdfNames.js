"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeUrdfName = void 0;
const sanitizeUrdfName = (name, allowHyphen = true) => {
    if (!name)
        return "";
    const trimmed = name.trim().replace(/\s+/g, "_");
    const allowed = allowHyphen ? ["_", "-"] : ["_"];
    const sanitized = Array.from(trimmed)
        .map((char) => {
        if (/[a-zA-Z0-9]/.test(char))
            return char;
        if (allowed.includes(char))
            return char;
        return "_";
    })
        .join("");
    if (sanitized && /\d/.test(sanitized[0])) {
        return `_${sanitized}`;
    }
    return sanitized;
};
exports.sanitizeUrdfName = sanitizeUrdfName;

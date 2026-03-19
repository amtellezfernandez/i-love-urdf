"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareUrdfs = void 0;
const canonicalOrdering_1 = require("./canonicalOrdering");
const prettyPrintURDF_1 = require("./prettyPrintURDF");
const normalizeUrdfForDiff = (content) => {
    if (!content.trim())
        return "";
    try {
        const canonical = (0, canonicalOrdering_1.canonicalOrderURDF)(content);
        const pretty = (0, prettyPrintURDF_1.prettyPrintURDF)(canonical);
        return pretty.trim();
    }
    catch {
        return content.trim();
    }
};
const compareUrdfs = (original, modified) => {
    const normalizedOriginal = normalizeUrdfForDiff(original);
    const normalizedModified = normalizeUrdfForDiff(modified);
    return {
        normalizedOriginal,
        normalizedModified,
        areEqual: normalizedOriginal === normalizedModified,
        differenceCount: countLineDifferences(normalizedOriginal, normalizedModified),
    };
};
exports.compareUrdfs = compareUrdfs;
const countLineDifferences = (a, b) => {
    const aLines = a.split(/\r?\n/);
    const bLines = b.split(/\r?\n/);
    const maxLen = Math.max(aLines.length, bLines.length);
    let diffCount = 0;
    for (let i = 0; i < maxLen; i++) {
        const left = aLines[i]?.trim() ?? "";
        const right = bLines[i]?.trim() ?? "";
        if (left !== right) {
            diffCount++;
        }
    }
    return diffCount;
};

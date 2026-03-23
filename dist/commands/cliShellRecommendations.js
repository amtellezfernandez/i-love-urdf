"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCandidateDetails = exports.detectSuggestedAction = exports.collectAttentionLines = exports.getHealthStatusLine = exports.getValidationStatusLine = exports.appendSuggestedActionLines = exports.formatAttentionDetail = exports.buildFixMeshPathsSuggestion = exports.buildRepairMeshRefsSuggestion = void 0;
const fs = require("node:fs");
const fixMeshPaths_1 = require("../mesh/fixMeshPaths");
const buildRepairMeshRefsSuggestion = () => ({
    kind: "repair-mesh-refs",
    summary: "mesh references need attention",
    recommendedLine: "recommended: repair mesh references",
    prompt: "repair mesh references now?  Enter yes  Esc not now",
    acceptLabel: "repair mesh references",
});
exports.buildRepairMeshRefsSuggestion = buildRepairMeshRefsSuggestion;
const buildFixMeshPathsSuggestion = () => ({
    kind: "fix-mesh-paths",
    summary: "mesh paths need attention",
    recommendedLine: "recommended: repair mesh paths",
    prompt: "repair mesh paths now?  Enter yes  Esc not now",
    acceptLabel: "repair mesh paths",
});
exports.buildFixMeshPathsSuggestion = buildFixMeshPathsSuggestion;
const formatAttentionDetail = (message, context) => context ? `${context}: ${message}` : message;
exports.formatAttentionDetail = formatAttentionDetail;
const appendSuggestedActionLines = (lines, suggestedAction, fallbackLine) => {
    if (!suggestedAction) {
        lines.push(fallbackLine);
        return;
    }
    if (!lines.includes(suggestedAction.summary)) {
        lines.push(suggestedAction.summary);
    }
    lines.push(suggestedAction.recommendedLine);
};
exports.appendSuggestedActionLines = appendSuggestedActionLines;
const getValidationStatusLine = (payload) => payload.isValid && payload.issues.length === 0
    ? "validation passed"
    : "validation needs attention";
exports.getValidationStatusLine = getValidationStatusLine;
const getHealthStatusLine = (payload) => payload.ok && payload.summary.errors === 0 && payload.summary.warnings === 0
    ? "health check passed"
    : "health check needs attention";
exports.getHealthStatusLine = getHealthStatusLine;
const collectAttentionLines = (validationIssues = [], healthFindings = [], limit = 2) => {
    const lines = [];
    for (const issue of validationIssues) {
        const line = (0, exports.formatAttentionDetail)(issue.message, issue.context);
        if (!lines.includes(line)) {
            lines.push(line);
        }
        if (lines.length >= limit) {
            return lines;
        }
    }
    for (const finding of healthFindings) {
        if (finding.level === "info") {
            continue;
        }
        const line = (0, exports.formatAttentionDetail)(finding.message, finding.context);
        if (!lines.includes(line)) {
            lines.push(line);
        }
        if (lines.length >= limit) {
            return lines;
        }
    }
    return lines;
};
exports.collectAttentionLines = collectAttentionLines;
const detectSuggestedAction = (state, options = {}) => {
    const source = state.loadedSource;
    if ((options.selectedCandidate?.unresolvedMeshReferenceCount ?? 0) > 0 &&
        source &&
        (source.source === "local-repo" || source.source === "github") &&
        source.repositoryUrdfPath) {
        return (0, exports.buildRepairMeshRefsSuggestion)();
    }
    const urdfPath = options.urdfPath ?? source?.urdfPath ?? state.lastUrdfPath;
    if (!urdfPath || source?.source !== "local-file") {
        return null;
    }
    try {
        const currentUrdf = fs.readFileSync(urdfPath, "utf8");
        const fixed = (0, fixMeshPaths_1.fixMeshPaths)(currentUrdf);
        return fixed.corrections.length > 0 ? (0, exports.buildFixMeshPathsSuggestion)() : null;
    }
    catch {
        return null;
    }
};
exports.detectSuggestedAction = detectSuggestedAction;
const getCandidateDetails = (candidate) => {
    const details = [candidate.inspectionMode === "xacro-source" ? "xacro" : "urdf"];
    if ((candidate.unresolvedMeshReferenceCount ?? 0) > 0) {
        details.push("mesh refs need attention");
    }
    if ((candidate.xacroArgs?.length ?? 0) > 0) {
        details.push("needs xacro args");
    }
    return details;
};
exports.getCandidateDetails = getCandidateDetails;

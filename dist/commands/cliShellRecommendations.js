"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCandidateDetails = exports.detectSuggestedAction = exports.hasAttentionIssues = exports.collectAttentionLines = exports.getHealthStatusLine = exports.getValidationStatusLine = exports.appendSuggestedActionLines = exports.formatAttentionDetail = exports.buildAlignOrientationSuggestion = exports.buildReviewAttentionSuggestion = exports.buildFixMeshPathsSuggestion = exports.buildRepairMeshRefsSuggestion = void 0;
const fs = require("node:fs");
const fixMeshPaths_1 = require("../mesh/fixMeshPaths");
const buildRepairMeshRefsSuggestion = () => ({
    kind: "repair-mesh-refs",
    summary: "mesh references need attention",
    recommendedLine: "recommended: repair mesh references",
    prompt: "repair mesh references now?",
    acceptLabel: "repair mesh references",
    acceptOptionLabel: "Repair now",
    skipOptionLabel: "Not now",
});
exports.buildRepairMeshRefsSuggestion = buildRepairMeshRefsSuggestion;
const buildFixMeshPathsSuggestion = () => ({
    kind: "fix-mesh-paths",
    summary: "mesh paths need attention",
    recommendedLine: "recommended: repair mesh paths",
    prompt: "repair mesh paths now?",
    acceptLabel: "repair mesh paths",
    acceptOptionLabel: "Repair now",
    skipOptionLabel: "Not now",
});
exports.buildFixMeshPathsSuggestion = buildFixMeshPathsSuggestion;
const buildReviewAttentionSuggestion = () => ({
    kind: "review-attention",
    summary: "some checks still need attention",
    recommendedLine: "recommended: review the remaining issues",
    prompt: "review the remaining issues now?",
    acceptLabel: "review the remaining issues",
    acceptOptionLabel: "Review now",
    skipOptionLabel: "Later",
});
exports.buildReviewAttentionSuggestion = buildReviewAttentionSuggestion;
const formatOrientationTarget = (plan) => `${plan.targetUpAxis}-up / ${plan.targetForwardAxis}-forward`;
const buildAlignOrientationSuggestion = (plan) => ({
    kind: "align-orientation",
    summary: `orientation differs from ${formatOrientationTarget(plan)}`,
    recommendedLine: `recommended: align orientation to ${formatOrientationTarget(plan)}`,
    prompt: `align orientation to ${formatOrientationTarget(plan)} now?`,
    acceptLabel: "align orientation",
    acceptOptionLabel: "Align now",
    skipOptionLabel: "Not now",
    orientationPlan: plan,
});
exports.buildAlignOrientationSuggestion = buildAlignOrientationSuggestion;
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
const hasAttentionIssues = (payload) => !payload.validation.isValid ||
    payload.validation.issues.length > 0 ||
    payload.health.summary.errors > 0 ||
    payload.health.summary.warnings > 0;
exports.hasAttentionIssues = hasAttentionIssues;
const getOrientationSuggestion = (orientationGuess) => {
    if (!orientationGuess?.isValid ||
        !orientationGuess.suggestedApplyOrientation?.sourceUpAxis ||
        !orientationGuess.suggestedApplyOrientation?.sourceForwardAxis ||
        !orientationGuess.suggestedApplyOrientation?.targetUpAxis ||
        !orientationGuess.suggestedApplyOrientation?.targetForwardAxis) {
        return null;
    }
    const confidence = typeof orientationGuess.confidence === "number" && Number.isFinite(orientationGuess.confidence)
        ? orientationGuess.confidence
        : 0;
    if (confidence < 0.72) {
        return null;
    }
    const sourceUpAxis = orientationGuess.suggestedApplyOrientation.sourceUpAxis;
    const sourceForwardAxis = orientationGuess.suggestedApplyOrientation.sourceForwardAxis;
    const targetUpAxis = orientationGuess.suggestedApplyOrientation.targetUpAxis;
    const targetForwardAxis = orientationGuess.suggestedApplyOrientation.targetForwardAxis;
    if (sourceUpAxis === targetUpAxis && sourceForwardAxis === targetForwardAxis) {
        return null;
    }
    return (0, exports.buildAlignOrientationSuggestion)({
        sourceUpAxis,
        sourceForwardAxis,
        targetUpAxis,
        targetForwardAxis,
    });
};
const detectSuggestedAction = (state, options = {}) => {
    const source = state.loadedSource;
    if ((options.selectedCandidate?.unresolvedMeshReferenceCount ?? 0) > 0 &&
        source &&
        (source.source === "local-repo" || source.source === "github") &&
        source.repositoryUrdfPath) {
        return (0, exports.buildRepairMeshRefsSuggestion)();
    }
    const urdfPath = options.urdfPath ?? source?.urdfPath ?? state.lastUrdfPath;
    if (urdfPath && source?.source === "local-file") {
        try {
            const currentUrdf = fs.readFileSync(urdfPath, "utf8");
            const fixed = (0, fixMeshPaths_1.fixMeshPaths)(currentUrdf);
            if (fixed.corrections.length > 0) {
                return (0, exports.buildFixMeshPathsSuggestion)();
            }
        }
        catch {
            return null;
        }
    }
    return getOrientationSuggestion(options.orientationGuess);
};
exports.detectSuggestedAction = detectSuggestedAction;
const getCandidateDetails = (candidate) => {
    const details = [candidate.inspectionMode === "xacro-source" ? "xacro" : "urdf"];
    if ((candidate.unresolvedMeshReferenceCount ?? 0) > 0) {
        details.push("mesh refs need attention");
    }
    const requiredXacroArgs = (candidate.xacroArgs ?? []).filter((arg) => arg.isRequired).length;
    if (requiredXacroArgs > 0) {
        details.push("requires xacro args");
    }
    else if ((candidate.xacroArgs?.length ?? 0) > 0) {
        details.push("xacro options");
    }
    return details;
};
exports.getCandidateDetails = getCandidateDetails;

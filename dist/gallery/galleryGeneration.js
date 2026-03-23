"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGalleryForCurrentUrdf = exports.runGalleryBatchForRepo = void 0;
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const index_1 = require("../index");
const githubCliAuth_1 = require("../node/githubCliAuth");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const fixMeshPaths_1 = require("../mesh/fixMeshPaths");
const loadSourceNode_1 = require("../sources/loadSourceNode");
const sharedSession_1 = require("../session/sharedSession");
const rotateRobot_1 = require("../utils/rotateRobot");
const studioThumbnailNode_1 = require("./studioThumbnailNode");
const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};
const slugify = (value) => value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const trimCompositeExtension = (value) => value.replace(/\.(urdf\.xacro|xacro|urdf)$/i, "");
const resolveGalleryWorkspaceRoot = () => path.resolve(process.env.ILU_GALLERY_REPO?.trim() ||
    process.env.ILU_GALLERY_OUTPUT?.trim() ||
    path.join(process.cwd(), "ilu-gallery-output"));
const resolveSourceWorkspaceDir = (outputRoot, sourceLabel) => path.join(outputRoot, slugify(sourceLabel) || "gallery");
const resolveCandidateOutputDir = (sourceDir, candidatePath) => {
    const normalized = trimCompositeExtension(candidatePath.replace(/\\/g, "/"));
    const segments = normalized.split("/").filter(Boolean).map(slugify);
    return path.join(sourceDir, "robots", ...(segments.length > 0 ? segments : ["robot"]));
};
const collectAttentionLines = (validation, health, limit = 3) => {
    const lines = [];
    for (const issue of validation.issues) {
        const line = issue.context ? `${issue.context}: ${issue.message}` : issue.message;
        if (!lines.includes(line)) {
            lines.push(line);
        }
        if (lines.length >= limit) {
            return lines;
        }
    }
    for (const finding of health.findings) {
        if (finding.level === "info") {
            continue;
        }
        const line = finding.context ? `${finding.context}: ${finding.message}` : finding.message;
        if (!lines.includes(line)) {
            lines.push(line);
        }
        if (lines.length >= limit) {
            return lines;
        }
    }
    return lines;
};
const extractOrientationPlan = (health) => {
    const guess = health.orientationGuess;
    if (!guess?.isValid ||
        !guess.suggestedApplyOrientation?.sourceUpAxis ||
        !guess.suggestedApplyOrientation?.sourceForwardAxis ||
        !guess.suggestedApplyOrientation?.targetUpAxis ||
        !guess.suggestedApplyOrientation?.targetForwardAxis) {
        return null;
    }
    const confidence = typeof guess.confidence === "number" && Number.isFinite(guess.confidence) ? guess.confidence : 0;
    if (confidence < 0.72) {
        return null;
    }
    return {
        sourceUpAxis: guess.suggestedApplyOrientation.sourceUpAxis,
        sourceForwardAxis: guess.suggestedApplyOrientation.sourceForwardAxis,
        targetUpAxis: guess.suggestedApplyOrientation.targetUpAxis,
        targetForwardAxis: guess.suggestedApplyOrientation.targetForwardAxis,
    };
};
const describeOrientationPlan = (plan) => `align orientation ${plan.sourceUpAxis}/${plan.sourceForwardAxis} -> ${plan.targetUpAxis}/${plan.targetForwardAxis}`;
const persistWorkingSession = (urdfContent, fileNameHint, loadedSource) => (0, sharedSession_1.writeIluSharedSession)({
    urdfContent,
    fileNameHint,
    loadedSource,
    lastUrdfPath: fileNameHint,
});
const writeJsonFile = (filePath, payload) => {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};
const writeTextFile = (filePath, text) => {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, text, "utf8");
};
const shouldSkipCandidate = (candidate) => {
    const requiredXacroArgs = (candidate.xacroArgs || []).filter((arg) => arg.isRequired);
    if (requiredXacroArgs.length > 0) {
        return `requires xacro args: ${requiredXacroArgs.map((arg) => arg.name).join(", ")}`;
    }
    return null;
};
const loadCandidateUrdf = async (source, candidate) => {
    if (source.kind === "github") {
        const reference = (0, githubRepositoryInspection_1.parseGitHubRepositoryReference)(source.githubRef);
        if (!reference) {
            throw new Error(`Invalid GitHub reference: ${source.githubRef}`);
        }
        const result = await (0, loadSourceNode_1.loadSourceFromGitHub)({
            reference,
            entryPath: candidate.path,
            accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(undefined),
        });
        return {
            urdfContent: result.urdf,
            fileNameHint: path.basename(result.entryPath),
            loadedSource: {
                source: "github",
                urdfPath: result.entryPath,
                githubRef: source.githubRef,
                githubRevision: result.ref,
                repositoryUrdfPath: result.entryPath,
            },
        };
    }
    const result = await (0, loadSourceNode_1.loadSourceFromPath)({
        path: source.localPath,
        entryPath: candidate.path,
    });
    return {
        urdfContent: result.urdf,
        fileNameHint: path.basename(result.entryPath),
        loadedSource: {
            source: "local-repo",
            urdfPath: result.entryPath,
            localPath: source.localPath,
            repositoryUrdfPath: result.entryPath,
        },
    };
};
const maybeRepairRepoMeshRefs = async (source, candidate, currentUrdf) => {
    if ((candidate.unresolvedMeshReferenceCount ?? 0) <= 0 || candidate.inspectionMode !== "urdf") {
        return { urdfContent: currentUrdf, appliedFixLabel: null };
    }
    if (source.kind === "github") {
        const reference = (0, githubRepositoryInspection_1.parseGitHubRepositoryReference)(source.githubRef);
        if (!reference) {
            return { urdfContent: currentUrdf, appliedFixLabel: null };
        }
        const repaired = await (0, githubRepositoryInspection_1.repairGitHubRepositoryMeshReferences)(reference, {
            accessToken: (0, githubCliAuth_1.resolveGitHubAccessToken)(undefined),
            urdfPath: candidate.path,
        });
        if (!repaired.success || repaired.content.trim().length === 0) {
            return { urdfContent: currentUrdf, appliedFixLabel: null };
        }
        return { urdfContent: repaired.content, appliedFixLabel: "repair mesh references" };
    }
    const repaired = await (0, localRepositoryInspection_1.repairLocalRepositoryMeshReferences)({ path: source.localPath }, {
        urdfPath: candidate.path,
    });
    if (!repaired.success || repaired.content.trim().length === 0) {
        return { urdfContent: currentUrdf, appliedFixLabel: null };
    }
    return { urdfContent: repaired.content, appliedFixLabel: "repair mesh references" };
};
const maybeFixMeshPaths = (urdfContent) => {
    const repaired = (0, fixMeshPaths_1.fixMeshPaths)(urdfContent);
    if (repaired.corrections.length === 0) {
        return { urdfContent, appliedFixLabel: null };
    }
    return {
        urdfContent: repaired.urdfContent,
        appliedFixLabel: "repair mesh paths",
    };
};
const maybeAlignOrientation = (urdfContent) => {
    const health = (0, index_1.healthCheckUrdf)(urdfContent);
    const plan = extractOrientationPlan(health);
    if (!plan) {
        return { urdfContent, appliedFixLabel: null };
    }
    return {
        urdfContent: (0, rotateRobot_1.applyOrientationToRobot)(urdfContent, {
            sourceUpAxis: plan.sourceUpAxis,
            sourceForwardAxis: plan.sourceForwardAxis,
            targetUpAxis: plan.targetUpAxis,
            targetForwardAxis: plan.targetForwardAxis,
        }),
        appliedFixLabel: describeOrientationPlan(plan),
    };
};
const classifyResultStatus = (validation, health, appliedFixes) => {
    const needsReview = !validation.isValid ||
        validation.issues.length > 0 ||
        health.summary.errors > 0 ||
        health.summary.warnings > 0;
    if (needsReview) {
        return "needs-review";
    }
    return appliedFixes.length > 0 ? "generated-with-fixes" : "generated";
};
const processRepoCandidate = async (source, candidate, sourceOutputDir, mode, thumbnailClient) => {
    const skippedReason = shouldSkipCandidate(candidate);
    const outputDir = resolveCandidateOutputDir(sourceOutputDir, candidate.path);
    ensureDir(outputDir);
    if (skippedReason) {
        const item = {
            candidatePath: candidate.path,
            status: "skipped",
            outputDir,
            workingUrdfPath: null,
            cardPath: null,
            thumbnailPath: null,
            reviewUrl: null,
            appliedFixes: [],
            attentionLines: [],
            skippedReason,
        };
        writeJsonFile(path.join(outputDir, "summary.json"), item);
        return item;
    }
    const loaded = await loadCandidateUrdf(source, candidate);
    let workingUrdf = loaded.urdfContent;
    const appliedFixes = [];
    const meshRefRepair = await maybeRepairRepoMeshRefs(source, candidate, workingUrdf);
    workingUrdf = meshRefRepair.urdfContent;
    if (meshRefRepair.appliedFixLabel) {
        appliedFixes.push(meshRefRepair.appliedFixLabel);
    }
    const meshPathRepair = maybeFixMeshPaths(workingUrdf);
    workingUrdf = meshPathRepair.urdfContent;
    if (meshPathRepair.appliedFixLabel) {
        appliedFixes.push(meshPathRepair.appliedFixLabel);
    }
    const orientationRepair = maybeAlignOrientation(workingUrdf);
    workingUrdf = orientationRepair.urdfContent;
    if (orientationRepair.appliedFixLabel) {
        appliedFixes.push(orientationRepair.appliedFixLabel);
    }
    const validation = (0, index_1.validateUrdf)(workingUrdf);
    const health = (0, index_1.healthCheckUrdf)(workingUrdf);
    const attentionLines = collectAttentionLines(validation, health);
    const workingUrdfPath = path.join(outputDir, "working.urdf");
    writeTextFile(workingUrdfPath, workingUrdf);
    let cardPath = null;
    let thumbnailPath = null;
    let reviewUrl = null;
    if (mode === "gallery") {
        const card = (0, index_1.buildRobotMorphologyCard)((0, index_1.analyzeUrdf)(workingUrdf));
        cardPath = path.join(outputDir, "card.json");
        writeJsonFile(cardPath, card);
        const snapshot = persistWorkingSession(workingUrdf, path.basename(candidate.path), {
            ...loaded.loadedSource,
            repositoryUrdfPath: candidate.path,
        });
        const thumbResult = thumbnailClient
            ? await thumbnailClient.captureSharedSessionThumbnail(snapshot.sessionId, path.join(outputDir, "thumbnail.png"))
            : {
                captured: false,
                outputPath: null,
                reviewUrl: "",
                skippedReason: "URDF Studio thumbnail capture is unavailable.",
            };
        thumbnailPath = thumbResult.outputPath;
        reviewUrl = thumbResult.reviewUrl || null;
    }
    const item = {
        candidatePath: candidate.path,
        status: classifyResultStatus(validation, health, appliedFixes),
        outputDir,
        workingUrdfPath,
        cardPath,
        thumbnailPath,
        reviewUrl,
        appliedFixes,
        attentionLines,
    };
    writeJsonFile(path.join(outputDir, "summary.json"), {
        ...item,
        validation: {
            isValid: validation.isValid,
            issues: validation.issues,
        },
        health: {
            ok: health.ok,
            summary: health.summary,
        },
    });
    return item;
};
const buildSharedFixGroups = (items) => {
    const counts = new Map();
    for (const item of items) {
        for (const fix of item.appliedFixes) {
            counts.set(fix, (counts.get(fix) ?? 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
};
const runGalleryBatchForRepo = async (source, candidates, options) => {
    const outputRoot = path.resolve(options.outputRoot || resolveGalleryWorkspaceRoot());
    const sourceOutputDir = resolveSourceWorkspaceDir(outputRoot, source.sourceLabel);
    ensureDir(sourceOutputDir);
    const thumbnailClient = options.mode === "gallery" ? options.thumbnailClient ?? new studioThumbnailNode_1.StudioThumbnailClient() : null;
    const ownThumbnailClient = options.mode === "gallery" && !options.thumbnailClient ? thumbnailClient : null;
    try {
        const items = [];
        for (const candidate of candidates) {
            items.push(await processRepoCandidate(source, candidate, sourceOutputDir, options.mode, thumbnailClient));
        }
        const result = {
            sourceLabel: source.sourceLabel,
            outputRoot: sourceOutputDir,
            robotCount: items.length,
            generatedCount: items.filter((item) => item.status === "generated").length,
            generatedWithFixesCount: items.filter((item) => item.status === "generated-with-fixes").length,
            needsReviewCount: items.filter((item) => item.status === "needs-review").length,
            skippedCount: items.filter((item) => item.status === "skipped").length,
            thumbnailCount: items.filter((item) => item.thumbnailPath).length,
            thumbnailSkippedCount: items.filter((item) => !item.thumbnailPath).length,
            sharedFixGroups: buildSharedFixGroups(items),
            items,
        };
        writeJsonFile(path.join(sourceOutputDir, "manifest.json"), result);
        return result;
    }
    finally {
        ownThumbnailClient?.close();
    }
};
exports.runGalleryBatchForRepo = runGalleryBatchForRepo;
const runGalleryForCurrentUrdf = async (source, outputRoot) => {
    const outputDir = resolveCandidateOutputDir(resolveSourceWorkspaceDir(path.resolve(outputRoot || resolveGalleryWorkspaceRoot()), source.sourceLabel), path.basename(source.urdfPath));
    ensureDir(outputDir);
    let workingUrdf = source.urdfContent;
    const appliedFixes = [];
    const meshPathRepair = maybeFixMeshPaths(workingUrdf);
    workingUrdf = meshPathRepair.urdfContent;
    if (meshPathRepair.appliedFixLabel) {
        appliedFixes.push(meshPathRepair.appliedFixLabel);
    }
    const orientationRepair = maybeAlignOrientation(workingUrdf);
    workingUrdf = orientationRepair.urdfContent;
    if (orientationRepair.appliedFixLabel) {
        appliedFixes.push(orientationRepair.appliedFixLabel);
    }
    const validation = (0, index_1.validateUrdf)(workingUrdf);
    const health = (0, index_1.healthCheckUrdf)(workingUrdf);
    const attentionLines = collectAttentionLines(validation, health);
    const cardPath = path.join(outputDir, "card.json");
    const workingUrdfPath = path.join(outputDir, "working.urdf");
    writeJsonFile(cardPath, (0, index_1.buildRobotMorphologyCard)((0, index_1.analyzeUrdf)(workingUrdf)));
    writeTextFile(workingUrdfPath, workingUrdf);
    const snapshot = persistWorkingSession(workingUrdf, path.basename(source.urdfPath), source.loadedSource);
    const thumbnailClient = new studioThumbnailNode_1.StudioThumbnailClient();
    try {
        const thumb = await thumbnailClient.captureSharedSessionThumbnail(snapshot.sessionId, path.join(outputDir, "thumbnail.png"));
        const result = {
            candidatePath: source.urdfPath,
            status: classifyResultStatus(validation, health, appliedFixes),
            outputDir,
            workingUrdfPath,
            cardPath,
            thumbnailPath: thumb.outputPath,
            reviewUrl: thumb.reviewUrl || null,
            appliedFixes,
            attentionLines,
        };
        writeJsonFile(path.join(outputDir, "summary.json"), result);
        return result;
    }
    finally {
        thumbnailClient.close();
    }
};
exports.runGalleryForCurrentUrdf = runGalleryForCurrentUrdf;

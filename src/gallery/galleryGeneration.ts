import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import {
  analyzeUrdf,
  buildRobotMorphologyCard,
  healthCheckUrdf,
  validateUrdf,
} from "../index";
import { resolveGitHubAccessToken } from "../node/githubCliAuth";
import {
  parseGitHubRepositoryReference,
  repairGitHubRepositoryMeshReferences,
} from "../repository/githubRepositoryInspection";
import { repairLocalRepositoryMeshReferences } from "../repository/localRepositoryInspection";
import { fixMeshPaths } from "../mesh/fixMeshPaths";
import { loadSourceFromGitHub, loadSourceFromPath } from "../sources/loadSourceNode";
import { writeIluSharedSession, type IluSharedLoadedSource } from "../session/sharedSession";
import { applyOrientationToRobot, type AxisSpec } from "../utils/rotateRobot";
import { StudioThumbnailClient, type ThumbnailCaptureResult } from "./studioThumbnailNode";

export type GalleryRepoSource =
  | {
      kind: "github";
      githubRef: string;
      sourceLabel: string;
    }
  | {
      kind: "local";
      localPath: string;
      sourceLabel: string;
    };

export type GalleryCurrentSource = {
  kind: "current";
  sourceLabel: string;
  urdfPath: string;
  urdfContent: string;
  loadedSource: IluSharedLoadedSource | null;
};

export type GalleryBatchCandidate = {
  path: string;
  inspectionMode?: "urdf" | "xacro-source";
  unresolvedMeshReferenceCount?: number;
  xacroArgs?: Array<{
    name: string;
    isRequired?: boolean;
  }>;
};

export type GalleryBatchMode = "gallery" | "repo-fixes";

export type GalleryItemResult = {
  candidatePath: string;
  status: "generated" | "generated-with-fixes" | "needs-review" | "skipped";
  outputDir: string;
  workingUrdfPath: string | null;
  cardPath: string | null;
  thumbnailPath: string | null;
  reviewUrl: string | null;
  appliedFixes: string[];
  attentionLines: string[];
  skippedReason?: string;
};

export type GalleryBatchResult = {
  sourceLabel: string;
  outputRoot: string;
  robotCount: number;
  generatedCount: number;
  generatedWithFixesCount: number;
  needsReviewCount: number;
  skippedCount: number;
  thumbnailCount: number;
  thumbnailSkippedCount: number;
  sharedFixGroups: Array<{ label: string; count: number }>;
  items: GalleryItemResult[];
};

type GalleryBatchOptions = {
  mode: GalleryBatchMode;
  outputRoot?: string;
  thumbnailClient?: StudioThumbnailClient | null;
};

type OrientationPlan = {
  sourceUpAxis: AxisSpec;
  sourceForwardAxis: AxisSpec;
  targetUpAxis: AxisSpec;
  targetForwardAxis: AxisSpec;
};

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const slugify = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const trimCompositeExtension = (value: string): string =>
  value.replace(/\.(urdf\.xacro|xacro|urdf)$/i, "");

const resolveGalleryWorkspaceRoot = (): string =>
  path.resolve(
    process.env.ILU_GALLERY_REPO?.trim() ||
      process.env.ILU_GALLERY_OUTPUT?.trim() ||
      path.join(process.cwd(), "ilu-gallery-output")
  );

const resolveSourceWorkspaceDir = (outputRoot: string, sourceLabel: string): string =>
  path.join(outputRoot, slugify(sourceLabel) || "gallery");

const resolveCandidateOutputDir = (sourceDir: string, candidatePath: string): string => {
  const normalized = trimCompositeExtension(candidatePath.replace(/\\/g, "/"));
  const segments = normalized.split("/").filter(Boolean).map(slugify);
  return path.join(sourceDir, "robots", ...(segments.length > 0 ? segments : ["robot"]));
};

const collectAttentionLines = (
  validation: ReturnType<typeof validateUrdf>,
  health: ReturnType<typeof healthCheckUrdf>,
  limit = 3
): string[] => {
  const lines: string[] = [];
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

const extractOrientationPlan = (
  health: ReturnType<typeof healthCheckUrdf>
): OrientationPlan | null => {
  const guess = health.orientationGuess;
  if (
    !guess?.isValid ||
    !guess.suggestedApplyOrientation?.sourceUpAxis ||
    !guess.suggestedApplyOrientation?.sourceForwardAxis ||
    !guess.suggestedApplyOrientation?.targetUpAxis ||
    !guess.suggestedApplyOrientation?.targetForwardAxis
  ) {
    return null;
  }

  const confidence =
    typeof guess.confidence === "number" && Number.isFinite(guess.confidence) ? guess.confidence : 0;
  if (confidence < 0.72) {
    return null;
  }

  return {
    sourceUpAxis: guess.suggestedApplyOrientation.sourceUpAxis as AxisSpec,
    sourceForwardAxis: guess.suggestedApplyOrientation.sourceForwardAxis as AxisSpec,
    targetUpAxis: guess.suggestedApplyOrientation.targetUpAxis as AxisSpec,
    targetForwardAxis: guess.suggestedApplyOrientation.targetForwardAxis as AxisSpec,
  };
};

const describeOrientationPlan = (plan: OrientationPlan): string =>
  `align orientation ${plan.sourceUpAxis}/${plan.sourceForwardAxis} -> ${plan.targetUpAxis}/${plan.targetForwardAxis}`;

const persistWorkingSession = (
  urdfContent: string,
  fileNameHint: string,
  loadedSource: IluSharedLoadedSource | null
) =>
  writeIluSharedSession({
    urdfContent,
    fileNameHint,
    loadedSource,
    lastUrdfPath: fileNameHint,
  });

const writeJsonFile = (filePath: string, payload: unknown) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const writeTextFile = (filePath: string, text: string) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
};

const shouldSkipCandidate = (candidate: GalleryBatchCandidate): string | null => {
  const requiredXacroArgs = (candidate.xacroArgs || []).filter((arg) => arg.isRequired);
  if (requiredXacroArgs.length > 0) {
    return `requires xacro args: ${requiredXacroArgs.map((arg) => arg.name).join(", ")}`;
  }
  return null;
};

const loadCandidateUrdf = async (
  source: GalleryRepoSource,
  candidate: GalleryBatchCandidate
): Promise<{
  urdfContent: string;
  fileNameHint: string;
  loadedSource: IluSharedLoadedSource;
}> => {
  if (source.kind === "github") {
    const reference = parseGitHubRepositoryReference(source.githubRef);
    if (!reference) {
      throw new Error(`Invalid GitHub reference: ${source.githubRef}`);
    }
    const result = await loadSourceFromGitHub({
      reference,
      entryPath: candidate.path,
      accessToken: resolveGitHubAccessToken(undefined),
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

  const result = await loadSourceFromPath({
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

const maybeRepairRepoMeshRefs = async (
  source: GalleryRepoSource,
  candidate: GalleryBatchCandidate,
  currentUrdf: string
): Promise<{ urdfContent: string; appliedFixLabel: string | null }> => {
  if ((candidate.unresolvedMeshReferenceCount ?? 0) <= 0 || candidate.inspectionMode !== "urdf") {
    return { urdfContent: currentUrdf, appliedFixLabel: null };
  }

  if (source.kind === "github") {
    const reference = parseGitHubRepositoryReference(source.githubRef);
    if (!reference) {
      return { urdfContent: currentUrdf, appliedFixLabel: null };
    }
    const repaired = await repairGitHubRepositoryMeshReferences(reference, {
      accessToken: resolveGitHubAccessToken(undefined),
      urdfPath: candidate.path,
    });
    if (!repaired.success || repaired.content.trim().length === 0) {
      return { urdfContent: currentUrdf, appliedFixLabel: null };
    }
    return { urdfContent: repaired.content, appliedFixLabel: "repair mesh references" };
  }

  const repaired = await repairLocalRepositoryMeshReferences(
    { path: source.localPath },
    {
      urdfPath: candidate.path,
    }
  );
  if (!repaired.success || repaired.content.trim().length === 0) {
    return { urdfContent: currentUrdf, appliedFixLabel: null };
  }
  return { urdfContent: repaired.content, appliedFixLabel: "repair mesh references" };
};

const maybeFixMeshPaths = (
  urdfContent: string
): {
  urdfContent: string;
  appliedFixLabel: string | null;
} => {
  const repaired = fixMeshPaths(urdfContent);
  if (repaired.corrections.length === 0) {
    return { urdfContent, appliedFixLabel: null };
  }
  return {
    urdfContent: repaired.urdfContent,
    appliedFixLabel: "repair mesh paths",
  };
};

const maybeAlignOrientation = (
  urdfContent: string
): {
  urdfContent: string;
  appliedFixLabel: string | null;
} => {
  const health = healthCheckUrdf(urdfContent);
  const plan = extractOrientationPlan(health);
  if (!plan) {
    return { urdfContent, appliedFixLabel: null };
  }

  return {
    urdfContent: applyOrientationToRobot(urdfContent, {
      sourceUpAxis: plan.sourceUpAxis,
      sourceForwardAxis: plan.sourceForwardAxis,
      targetUpAxis: plan.targetUpAxis,
      targetForwardAxis: plan.targetForwardAxis,
    }),
    appliedFixLabel: describeOrientationPlan(plan),
  };
};

const classifyResultStatus = (
  validation: ReturnType<typeof validateUrdf>,
  health: ReturnType<typeof healthCheckUrdf>,
  appliedFixes: readonly string[]
): GalleryItemResult["status"] => {
  const needsReview =
    !validation.isValid ||
    validation.issues.length > 0 ||
    health.summary.errors > 0 ||
    health.summary.warnings > 0;
  if (needsReview) {
    return "needs-review";
  }
  return appliedFixes.length > 0 ? "generated-with-fixes" : "generated";
};

const processRepoCandidate = async (
  source: GalleryRepoSource,
  candidate: GalleryBatchCandidate,
  sourceOutputDir: string,
  mode: GalleryBatchMode,
  thumbnailClient: StudioThumbnailClient | null
): Promise<GalleryItemResult> => {
  const skippedReason = shouldSkipCandidate(candidate);
  const outputDir = resolveCandidateOutputDir(sourceOutputDir, candidate.path);
  ensureDir(outputDir);

  if (skippedReason) {
    const item: GalleryItemResult = {
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
  const appliedFixes: string[] = [];

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

  const validation = validateUrdf(workingUrdf);
  const health = healthCheckUrdf(workingUrdf);
  const attentionLines = collectAttentionLines(validation, health);

  const workingUrdfPath = path.join(outputDir, "working.urdf");
  writeTextFile(workingUrdfPath, workingUrdf);

  let cardPath: string | null = null;
  let thumbnailPath: string | null = null;
  let reviewUrl: string | null = null;

  if (mode === "gallery") {
    const card = buildRobotMorphologyCard(analyzeUrdf(workingUrdf));
    cardPath = path.join(outputDir, "card.json");
    writeJsonFile(cardPath, card);

    const snapshot = persistWorkingSession(workingUrdf, path.basename(candidate.path), {
      ...loaded.loadedSource,
      repositoryUrdfPath: candidate.path,
    });

    const thumbResult: ThumbnailCaptureResult = thumbnailClient
      ? await thumbnailClient.captureSharedSessionThumbnail(
          snapshot.sessionId,
          path.join(outputDir, "thumbnail.png")
        )
      : {
          captured: false,
          outputPath: null,
          reviewUrl: "",
          skippedReason: "URDF Studio thumbnail capture is unavailable.",
        };

    thumbnailPath = thumbResult.outputPath;
    reviewUrl = thumbResult.reviewUrl || null;
  }

  const item: GalleryItemResult = {
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

const buildSharedFixGroups = (items: readonly GalleryItemResult[]): Array<{ label: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const fix of item.appliedFixes) {
      counts.set(fix, (counts.get(fix) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
};

export const runGalleryBatchForRepo = async (
  source: GalleryRepoSource,
  candidates: readonly GalleryBatchCandidate[],
  options: GalleryBatchOptions
): Promise<GalleryBatchResult> => {
  const outputRoot = path.resolve(options.outputRoot || resolveGalleryWorkspaceRoot());
  const sourceOutputDir = resolveSourceWorkspaceDir(outputRoot, source.sourceLabel);
  ensureDir(sourceOutputDir);

  const thumbnailClient =
    options.mode === "gallery" ? options.thumbnailClient ?? new StudioThumbnailClient() : null;
  const ownThumbnailClient = options.mode === "gallery" && !options.thumbnailClient ? thumbnailClient : null;

  try {
    const items: GalleryItemResult[] = [];
    for (const candidate of candidates) {
      items.push(await processRepoCandidate(source, candidate, sourceOutputDir, options.mode, thumbnailClient));
    }

    const result: GalleryBatchResult = {
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
  } finally {
    ownThumbnailClient?.close();
  }
};

export const runGalleryForCurrentUrdf = async (
  source: GalleryCurrentSource,
  outputRoot?: string
): Promise<GalleryItemResult> => {
  const outputDir = resolveCandidateOutputDir(
    resolveSourceWorkspaceDir(path.resolve(outputRoot || resolveGalleryWorkspaceRoot()), source.sourceLabel),
    path.basename(source.urdfPath)
  );
  ensureDir(outputDir);

  let workingUrdf = source.urdfContent;
  const appliedFixes: string[] = [];

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

  const validation = validateUrdf(workingUrdf);
  const health = healthCheckUrdf(workingUrdf);
  const attentionLines = collectAttentionLines(validation, health);

  const cardPath = path.join(outputDir, "card.json");
  const workingUrdfPath = path.join(outputDir, "working.urdf");
  writeJsonFile(cardPath, buildRobotMorphologyCard(analyzeUrdf(workingUrdf)));
  writeTextFile(workingUrdfPath, workingUrdf);

  const snapshot = persistWorkingSession(workingUrdf, path.basename(source.urdfPath), source.loadedSource);
  const thumbnailClient = new StudioThumbnailClient();
  try {
    const thumb = await thumbnailClient.captureSharedSessionThumbnail(
      snapshot.sessionId,
      path.join(outputDir, "thumbnail.png")
    );
    const result: GalleryItemResult = {
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
  } finally {
    thumbnailClient.close();
  }
};

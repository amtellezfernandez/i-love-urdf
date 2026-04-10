import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveGitHubAccessToken } from "../node/githubCliAuth";
import {
  inspectGitHubRepositoryUrdfs,
  parseGitHubRepositoryReference,
} from "../repository/githubRepositoryInspection";
import { inspectLocalRepositoryUrdfs } from "../repository/localRepositoryInspection";

export type RepoMediaRenderAssetKind = "image" | "video";

export type RepoMediaRenderSource =
  | {
      kind: "github";
      githubUrl: string;
      sourcePath?: string;
      ref?: string;
    }
  | {
      kind: "local";
      localPath: string;
    };

export type RepoMediaRenderItem = {
  candidatePath: string;
  thumbnailPath: string;
  videoPath: string;
};

export type RepoMediaRenderResult = {
  outputRoot: string;
  items: RepoMediaRenderItem[];
};

const THUMBNAIL_MISSING_TARGET_ERROR_PATTERN =
  /Unable to find the requested URDF target in the GitHub repository\./i;
const FRAME_COUNT = 28;
const FRAME_DELAY_MS = 50;
const READY_TIMEOUT_MS = 120_000;
const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 720;
const SAFE_BASE_FALLBACK = "robot";

const ensureDir = async (targetPath: string) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const loadPlaywright = async (): Promise<any> => {
  try {
    return await Function("return import('playwright');")();
  } catch {
    throw new Error("playwright is required for gallery rendering. Install it and retry.");
  }
};

type GalleryRenderStateSnapshot = {
  phase?: string;
  ready?: boolean;
  cameraApplied?: boolean;
  error?: string | null;
};

const normalizeRenderTargetPath = (value: string): string =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/u, "")
    .replace(/\/+/gu, "/");

const joinRenderTargetPath = (...segments: string[]): string =>
  segments
    .map((segment) => normalizeRenderTargetPath(segment))
    .filter(Boolean)
    .join("/");

const trimRenderTargetExtension = (value: string): string => {
  const normalized = normalizeRenderTargetPath(value);
  if (normalized.toLowerCase().endsWith(".urdf.xacro")) {
    return normalized.slice(0, -".urdf.xacro".length);
  }
  if (normalized.toLowerCase().endsWith(".xacro")) {
    return normalized.slice(0, -".xacro".length);
  }
  if (normalized.toLowerCase().endsWith(".urdf")) {
    return normalized.slice(0, -".urdf".length);
  }
  return normalized;
};

export const isMissingThumbnailTargetError = (error: unknown): boolean =>
  error instanceof Error && THUMBNAIL_MISSING_TARGET_ERROR_PATTERN.test(error.message);

export const buildRenderTargetCandidates = (
  source: RepoMediaRenderSource,
  candidatePath: string
): string[] => {
  const normalizedCandidate = normalizeRenderTargetPath(candidatePath);
  if (!normalizedCandidate) {
    return [];
  }

  const segments = normalizedCandidate.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] || normalizedCandidate;
  const trailingPair =
    segments.length >= 2 ? segments.slice(-2).join("/") : normalizedCandidate;
  const candidates = new Set<string>([normalizedCandidate, fileName, trailingPair]);

  if (source.kind === "github") {
    const normalizedSourcePath = normalizeRenderTargetPath(source.sourcePath || "");
    if (
      normalizedSourcePath &&
      normalizedCandidate !== normalizedSourcePath &&
      !normalizedCandidate.startsWith(`${normalizedSourcePath}/`)
    ) {
      candidates.add(joinRenderTargetPath(normalizedSourcePath, normalizedCandidate));
    }
    if (normalizedSourcePath) {
      candidates.add(joinRenderTargetPath(normalizedSourcePath, fileName));
      candidates.add(joinRenderTargetPath(normalizedSourcePath, trailingPair));
    }
  }

  return Array.from(candidates).filter(Boolean);
};

const scoreResolvedRenderTargetPath = (
  source: RepoMediaRenderSource,
  requestedPath: string,
  candidatePath: string
): number => {
  const normalizedCandidate = normalizeRenderTargetPath(candidatePath).toLowerCase();
  if (!normalizedCandidate) {
    return Number.NEGATIVE_INFINITY;
  }

  const normalizedRequested = normalizeRenderTargetPath(requestedPath).toLowerCase();
  const requestedVariants = buildRenderTargetCandidates(source, requestedPath).map((value) =>
    value.toLowerCase()
  );
  const requestedBaseName =
    normalizedRequested.split("/").pop() || normalizedRequested;
  const requestedStem = trimRenderTargetExtension(requestedBaseName).toLowerCase();
  const candidateBaseName =
    normalizedCandidate.split("/").pop() || normalizedCandidate;
  const candidateStem = trimRenderTargetExtension(candidateBaseName).toLowerCase();

  let score = 0;
  const exactVariantIndex = requestedVariants.indexOf(normalizedCandidate);
  if (exactVariantIndex >= 0) {
    score += 1_000 - exactVariantIndex * 100;
  }
  if (requestedVariants.some((variant) => normalizedCandidate.endsWith(`/${variant}`))) {
    score += 700;
  }
  if (candidateBaseName === requestedBaseName) {
    score += 400;
  }
  if (candidateStem === requestedStem) {
    score += 250;
  }
  if (normalizedRequested && normalizedCandidate.endsWith(`/${normalizedRequested}`)) {
    score += 200;
  }
  if (normalizedRequested && normalizedRequested.endsWith(`/${candidateBaseName}`)) {
    score += 120;
  }
  score -= normalizedCandidate.length;
  return score;
};

export const selectResolvedRenderTargetPath = (
  source: RepoMediaRenderSource,
  requestedPath: string,
  inspectedCandidatePaths: readonly string[]
): string | null => {
  let bestPath: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidatePath of inspectedCandidatePaths) {
    const score = scoreResolvedRenderTargetPath(source, requestedPath, candidatePath);
    if (score > bestScore) {
      bestScore = score;
      bestPath = candidatePath;
    }
  }

  return bestScore > 0 ? bestPath : null;
};

const resolveInspectedRenderTargetPath = async (
  source: RepoMediaRenderSource,
  requestedPath: string
): Promise<string | null> => {
  const inspectedCandidatePaths =
    source.kind === "github"
      ? await (async () => {
          const reference = parseGitHubRepositoryReference(source.githubUrl);
          if (!reference) {
            return [];
          }
          const inspection = await inspectGitHubRepositoryUrdfs(reference, {
            accessToken: resolveGitHubAccessToken(undefined),
          });
          return inspection.candidates.map((candidate) => candidate.path);
        })()
      : await (async () => {
          const inspection = await inspectLocalRepositoryUrdfs({ path: source.localPath });
          return inspection.candidates.map((candidate) => candidate.path);
        })();

  return selectResolvedRenderTargetPath(source, requestedPath, inspectedCandidatePaths);
};

export const isThumbnailRenderReady = (input: {
  renderState?: GalleryRenderStateSnapshot | null;
  thumbError?: string | null;
  readyAttribute?: string | null;
}): boolean => {
  const renderError =
    typeof input.renderState?.error === "string" && input.renderState.error.trim()
      ? input.renderState.error
      : "";
  const thumbError = typeof input.thumbError === "string" && input.thumbError.trim() ? input.thumbError : "";
  if (thumbError || renderError) {
    throw new Error(thumbError || renderError);
  }
  if (input.renderState) {
    return (
      input.renderState.ready === true &&
      input.renderState.cameraApplied === true &&
      input.renderState.phase === "ready"
    );
  }
  return input.readyAttribute === "1";
};

const waitForThumbReady = async (page: any) => {
  await page.waitForFunction(
    () => {
      return isThumbnailRenderReady({
        renderState: (window as any).__URDF_GALLERY_RENDER_STATE__,
        thumbError: (window as any).__URDF_THUMB_ERROR__,
        readyAttribute: document.body?.getAttribute("data-urdf-thumb-ready"),
      });
    },
    { timeout: READY_TIMEOUT_MS }
  );
};

export const resolveRenderableTargetPath = async (
  source: RepoMediaRenderSource,
  candidatePath: string,
  attemptLoad: (targetPath: string) => Promise<void>
): Promise<string> => {
  const targetCandidates = buildRenderTargetCandidates(source, candidatePath);
  if (targetCandidates.length === 0) {
    throw new Error("At least one candidate path is required.");
  }

  let lastError: unknown = null;
  for (let index = 0; index < targetCandidates.length; index += 1) {
    const targetPath = targetCandidates[index];
    try {
      await attemptLoad(targetPath);
      return targetPath;
    } catch (error) {
      lastError = error;
      const hasMoreCandidates = index < targetCandidates.length - 1;
      if (!hasMoreCandidates || !isMissingThumbnailTargetError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to resolve a renderable URDF target.");
};

const startCanvasRecording = async (canvasHandle: any) => {
  await canvasHandle.evaluate((canvas: HTMLCanvasElement, frameDelayMs: number) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("URDF thumbnail canvas was not found.");
    }
    const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType =
      mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
    if (!mimeType) {
      throw new Error("This browser does not support WebM recording.");
    }
    const stream = canvas.captureStream(Math.round(1000 / frameDelayMs));
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })));
      recorder.addEventListener("error", (event: any) => reject(event.error || new Error("Canvas recording failed.")));
    });
    (window as any).__URDF_GALLERY_RECORDING__ = { done, recorder };
    recorder.start();
  }, FRAME_DELAY_MS);
};

const finishCanvasRecording = async (canvasHandle: any, outputPath: string) => {
  const dataUrl = await canvasHandle.evaluate(async () => {
    const recording = (window as any).__URDF_GALLERY_RECORDING__;
    if (!recording) {
      throw new Error("Canvas recording was not started.");
    }
    recording.recorder.stop();
    const blob = await recording.done;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(new Error("Failed to read recorded video.")));
      reader.readAsDataURL(blob);
    });
  });
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Recorded video payload was invalid.");
  }
  await fs.writeFile(outputPath, Buffer.from(dataUrl.slice(commaIndex + 1), "base64"));
};

const captureOrbitVideo = async (page: any, canvasHandle: any) => {
  const box = await canvasHandle.boundingBox();
  if (!box) {
    throw new Error("Thumbnail canvas is not available.");
  }
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const dragDistance = Math.max(80, Math.round(box.width * 0.22));

  await startCanvasRecording(canvasHandle);
  await page.mouse.move(centerX - dragDistance / 2, centerY);
  await page.mouse.down();
  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    const progress = frameIndex / Math.max(1, FRAME_COUNT - 1);
    await page.mouse.move(centerX - dragDistance / 2 + dragDistance * progress, centerY);
    await page.waitForTimeout(FRAME_DELAY_MS);
  }
  await page.mouse.up();
};

const buildRenderUrl = (appUrl: string, source: RepoMediaRenderSource, candidatePath: string): string => {
  const url = new URL(appUrl.replace(/\/+$/, "") + "/");
  url.searchParams.set("thumbnail", "1");
  url.searchParams.set("urdf", candidatePath);
  if (source.kind === "github") {
    url.searchParams.set("github", source.githubUrl);
  } else {
    url.searchParams.set("local", source.localPath);
  }
  return url.toString();
};

const toSafeBaseName = (candidatePath: string): string =>
  path.basename(candidatePath).replace(/\.[^.]+$/u, "") || SAFE_BASE_FALLBACK;

export const renderRepoMediaBatch = async (
  source: RepoMediaRenderSource,
  appUrl: string,
  outputRoot: string,
  candidatePaths: readonly string[],
  assetKinds: readonly RepoMediaRenderAssetKind[]
): Promise<RepoMediaRenderResult> => {
  if (candidatePaths.length === 0) {
    throw new Error("At least one candidate path is required.");
  }

  const requestedAssetKinds = Array.from(
    new Set(
      assetKinds.map((assetKind) => String(assetKind).trim().toLowerCase()).filter(Boolean)
    )
  ) as RepoMediaRenderAssetKind[];
  if (requestedAssetKinds.length === 0) {
    throw new Error("At least one gallery asset kind is required.");
  }

  const shouldCaptureImage = requestedAssetKinds.includes("image");
  const shouldCaptureVideo = requestedAssetKinds.includes("video");
  const playwright = await loadPlaywright();
  await ensureDir(outputRoot);
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    });
    const page = await context.newPage();
    const items: RepoMediaRenderItem[] = [];

    for (const candidatePath of candidatePaths) {
      const itemDir = path.join(outputRoot, "generated", toSafeBaseName(candidatePath));
      const thumbnailPath = path.join(itemDir, "thumbnail.png");
      const videoPath = path.join(itemDir, "preview.webm");
      await ensureDir(itemDir);

      const requestedTargetCandidates = new Set(buildRenderTargetCandidates(source, candidatePath));
      try {
        await resolveRenderableTargetPath(source, candidatePath, async (targetPath) => {
          await page.goto(buildRenderUrl(appUrl, source, targetPath), { waitUntil: "networkidle" });
          await waitForThumbReady(page);
        });
      } catch (error) {
        if (!isMissingThumbnailTargetError(error)) {
          throw error;
        }
        const inspectedTargetPath = await resolveInspectedRenderTargetPath(source, candidatePath);
        if (!inspectedTargetPath || requestedTargetCandidates.has(inspectedTargetPath)) {
          throw error;
        }
        await page.goto(buildRenderUrl(appUrl, source, inspectedTargetPath), {
          waitUntil: "networkidle",
        });
        await waitForThumbReady(page);
      }
      const canvasHandle = await page.locator("#urdf-thumb-canvas canvas").elementHandle();
      if (!canvasHandle) {
        throw new Error("URDF thumbnail canvas was not found.");
      }

      if (shouldCaptureImage) {
        await canvasHandle.screenshot({ path: thumbnailPath, omitBackground: true });
      }
      if (shouldCaptureVideo) {
        await captureOrbitVideo(page, canvasHandle);
        await finishCanvasRecording(canvasHandle, videoPath);
      }

      items.push({
        candidatePath,
        thumbnailPath: shouldCaptureImage ? thumbnailPath : "",
        videoPath: shouldCaptureVideo ? videoPath : "",
      });
    }

    const result: RepoMediaRenderResult = {
      outputRoot,
      items,
    };
    await fs.writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  } finally {
    await browser.close();
  }
};

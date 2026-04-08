"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderRepoMediaBatch = exports.isThumbnailRenderReady = void 0;
const fs = require("node:fs/promises");
const path = require("node:path");
const FRAME_COUNT = 28;
const FRAME_DELAY_MS = 50;
const READY_TIMEOUT_MS = 120000;
const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 720;
const SAFE_BASE_FALLBACK = "robot";
const ensureDir = async (targetPath) => {
    await fs.mkdir(targetPath, { recursive: true });
};
const loadPlaywright = async () => {
    try {
        return await Function("return import('playwright');")();
    }
    catch {
        throw new Error("playwright is required for gallery rendering. Install it and retry.");
    }
};
const isThumbnailRenderReady = (input) => {
    const renderError = typeof input.renderState?.error === "string" && input.renderState.error.trim()
        ? input.renderState.error
        : "";
    const thumbError = typeof input.thumbError === "string" && input.thumbError.trim() ? input.thumbError : "";
    if (thumbError || renderError) {
        throw new Error(thumbError || renderError);
    }
    if (input.renderState) {
        return (input.renderState.ready === true &&
            input.renderState.cameraApplied === true &&
            input.renderState.phase === "ready");
    }
    return input.readyAttribute === "1";
};
exports.isThumbnailRenderReady = isThumbnailRenderReady;
const waitForThumbReady = async (page) => {
    await page.waitForFunction(() => {
        return (0, exports.isThumbnailRenderReady)({
            renderState: window.__URDF_GALLERY_RENDER_STATE__,
            thumbError: window.__URDF_THUMB_ERROR__,
            readyAttribute: document.body?.getAttribute("data-urdf-thumb-ready"),
        });
    }, { timeout: READY_TIMEOUT_MS });
};
const startCanvasRecording = async (canvasHandle) => {
    await canvasHandle.evaluate((canvas, frameDelayMs) => {
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("URDF thumbnail canvas was not found.");
        }
        const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
        const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
        if (!mimeType) {
            throw new Error("This browser does not support WebM recording.");
        }
        const stream = canvas.captureStream(Math.round(1000 / frameDelayMs));
        const chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType });
        const done = new Promise((resolve, reject) => {
            recorder.addEventListener("dataavailable", (event) => {
                if (event.data && event.data.size > 0) {
                    chunks.push(event.data);
                }
            });
            recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })));
            recorder.addEventListener("error", (event) => reject(event.error || new Error("Canvas recording failed.")));
        });
        window.__URDF_GALLERY_RECORDING__ = { done, recorder };
        recorder.start();
    }, FRAME_DELAY_MS);
};
const finishCanvasRecording = async (canvasHandle, outputPath) => {
    const dataUrl = await canvasHandle.evaluate(async () => {
        const recording = window.__URDF_GALLERY_RECORDING__;
        if (!recording) {
            throw new Error("Canvas recording was not started.");
        }
        recording.recorder.stop();
        const blob = await recording.done;
        return await new Promise((resolve, reject) => {
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
const captureOrbitVideo = async (page, canvasHandle) => {
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
const buildRenderUrl = (appUrl, source, candidatePath) => {
    const url = new URL(appUrl.replace(/\/+$/, "") + "/");
    url.searchParams.set("thumbnail", "1");
    url.searchParams.set("urdf", candidatePath);
    if (source.kind === "github") {
        url.searchParams.set("github", source.githubUrl);
    }
    else {
        url.searchParams.set("local", source.localPath);
    }
    return url.toString();
};
const toSafeBaseName = (candidatePath) => path.basename(candidatePath).replace(/\.[^.]+$/u, "") || SAFE_BASE_FALLBACK;
const renderRepoMediaBatch = async (source, appUrl, outputRoot, candidatePaths, assetKinds) => {
    if (candidatePaths.length === 0) {
        throw new Error("At least one candidate path is required.");
    }
    const requestedAssetKinds = Array.from(new Set(assetKinds.map((assetKind) => String(assetKind).trim().toLowerCase()).filter(Boolean)));
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
        const items = [];
        for (const candidatePath of candidatePaths) {
            const itemDir = path.join(outputRoot, "generated", toSafeBaseName(candidatePath));
            const thumbnailPath = path.join(itemDir, "thumbnail.png");
            const videoPath = path.join(itemDir, "preview.webm");
            await ensureDir(itemDir);
            await page.goto(buildRenderUrl(appUrl, source, candidatePath), { waitUntil: "networkidle" });
            await waitForThumbReady(page);
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
        const result = {
            outputRoot,
            items,
        };
        await fs.writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
        return result;
    }
    finally {
        await browser.close();
    }
};
exports.renderRepoMediaBatch = renderRepoMediaBatch;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudioThumbnailClient = void 0;
const node_child_process_1 = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const sharedSession_1 = require("../session/sharedSession");
const studioRuntime_1 = require("../studio/studioRuntime");
const THUMB_READY_TIMEOUT_MS = 45000;
const THUMB_WINDOW_SIZE = "1400,1000";
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const resolveChromeBinary = () => {
    const candidates = [
        process.env.ILU_CHROME_PATH,
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
    ].filter((candidate) => Boolean(candidate && candidate.trim()));
    for (const candidate of candidates) {
        if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
            return candidate;
        }
        const locator = process.platform === "win32" ? "where" : "which";
        const result = (0, node_child_process_1.spawnSync)(locator, [candidate], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        const resolved = result.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line.length > 0);
        if (result.status === 0 && resolved) {
            return resolved;
        }
    }
    return null;
};
const canUseStudioThumbnails = () => !/^(1|true|yes)$/i.test(process.env.ILU_DISABLE_STUDIO_THUMBNAILS || "");
const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};
const waitForThumbReadyMarker = async (chromeBinary, reviewUrl) => {
    const deadline = Date.now() + THUMB_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const result = (0, node_child_process_1.spawnSync)(chromeBinary, [
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=12000",
            "--dump-dom",
            reviewUrl,
        ], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        const output = (result.stdout || "") + (result.stderr || "");
        if (result.status === 0 && /data-urdf-thumb-ready="1"/i.test(output)) {
            return true;
        }
        await sleep(1200);
    }
    return false;
};
class StudioThumbnailClient {
    constructor() {
        this.handle = null;
        this.startupError = null;
        this.chromeBinary = resolveChromeBinary();
    }
    async captureSharedSessionThumbnail(sessionId, outputPath) {
        const reviewUrl = (() => {
            const url = new URL((0, sharedSession_1.buildStudioSessionUrl)(sessionId));
            url.searchParams.set("thumbnail", "1");
            return url.toString();
        })();
        if (!canUseStudioThumbnails()) {
            return {
                captured: false,
                outputPath: null,
                reviewUrl,
                skippedReason: "Studio thumbnail capture is disabled for this run.",
            };
        }
        if (!this.chromeBinary) {
            return {
                captured: false,
                outputPath: null,
                reviewUrl,
                skippedReason: "Google Chrome or Chromium was not found on this machine.",
            };
        }
        if (this.startupError) {
            return {
                captured: false,
                outputPath: null,
                reviewUrl,
                skippedReason: this.startupError,
            };
        }
        if (!this.handle) {
            const started = await (0, studioRuntime_1.ensureStudioRunning)();
            if (started.ok === false) {
                this.startupError = started.reason;
                return {
                    captured: false,
                    outputPath: null,
                    reviewUrl,
                    skippedReason: started.reason,
                };
            }
            this.handle = started.handle;
        }
        ensureDir(path.dirname(outputPath));
        const ready = await waitForThumbReadyMarker(this.chromeBinary, reviewUrl);
        if (!ready) {
            return {
                captured: false,
                outputPath: null,
                reviewUrl,
                skippedReason: "URDF Studio thumbnail view did not become ready in time.",
            };
        }
        const capture = (0, node_child_process_1.spawnSync)(this.chromeBinary, [
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--run-all-compositor-stages-before-draw",
            "--window-size=" + THUMB_WINDOW_SIZE,
            "--default-background-color=00000000",
            "--screenshot=" + outputPath,
            "--virtual-time-budget=12000",
            reviewUrl,
        ], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        if (capture.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
            return {
                captured: false,
                outputPath: null,
                reviewUrl,
                skippedReason: (capture.stderr || capture.stdout || "thumbnail capture failed").trim() ||
                    "thumbnail capture failed",
            };
        }
        return {
            captured: true,
            outputPath,
            reviewUrl,
        };
    }
    close() {
        this.handle?.close();
        this.handle = null;
    }
}
exports.StudioThumbnailClient = StudioThumbnailClient;

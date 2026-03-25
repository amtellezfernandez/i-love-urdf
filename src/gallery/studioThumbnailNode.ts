import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { buildStudioSessionUrl } from "../session/sharedSession";
import { ensureStudioRunning, type StudioHandle } from "../studio/studioRuntime";

const THUMB_READY_TIMEOUT_MS = 45_000;
const THUMB_WINDOW_SIZE = "1400,1000";

export type ThumbnailCaptureResult = {
  captured: boolean;
  outputPath: string | null;
  reviewUrl: string;
  skippedReason?: string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const resolveChromeBinary = (): string | null => {
  const candidates = [
    process.env.ILU_CHROME_PATH,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()));

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
      return candidate;
    }

    const locator = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(locator, [candidate], {
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

const canUseStudioThumbnails = (): boolean =>
  !/^(1|true|yes)$/i.test(process.env.ILU_DISABLE_STUDIO_THUMBNAILS || "");

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const waitForThumbReadyMarker = async (
  chromeBinary: string,
  reviewUrl: string
): Promise<boolean> => {
  const deadline = Date.now() + THUMB_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = spawnSync(
      chromeBinary,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=12000",
        "--dump-dom",
        reviewUrl,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    const output = (result.stdout || "") + (result.stderr || "");
    if (result.status === 0 && /data-urdf-thumb-ready="1"/i.test(output)) {
      return true;
    }
    await sleep(1200);
  }

  return false;
};

export class StudioThumbnailClient {
  private handle: StudioHandle | null = null;
  private startupError: string | null = null;
  private readonly chromeBinary: string | null;

  public constructor() {
    this.chromeBinary = resolveChromeBinary();
  }

  public async captureSharedSessionThumbnail(
    sessionId: string,
    outputPath: string
  ): Promise<ThumbnailCaptureResult> {
    const reviewUrl = (() => {
      const url = new URL(buildStudioSessionUrl(sessionId));
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
      const started = await ensureStudioRunning();
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

    const capture = spawnSync(
      this.chromeBinary,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--run-all-compositor-stages-before-draw",
        "--window-size=" + THUMB_WINDOW_SIZE,
        "--default-background-color=00000000",
        "--screenshot=" + outputPath,
        "--virtual-time-budget=12000",
        reviewUrl,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    if (capture.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return {
        captured: false,
        outputPath: null,
        reviewUrl,
        skippedReason:
          ((capture.stderr || capture.stdout || "thumbnail capture failed") as string).trim() ||
          "thumbnail capture failed",
      };
    }

    return {
      captured: true,
      outputPath,
      reviewUrl,
    };
  }

  public close() {
    this.handle?.close();
    this.handle = null;
  }
}

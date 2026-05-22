import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import {
  DEFAULT_REPLAY_PLAYBACK_RATE,
  capturePlanStyle,
  createPhoneReplayCapturePlan,
} from "./capture-plan";
import type { BaseRecordingTiming, ClipCapturePlan, ClipFactoryPacket } from "./edit-model";
import { TIKTOK_CANVAS } from "./edit-model";
import { detectBaseRecordingTiming } from "./base-recording-timing";
import { parseClipFactoryPacketWire } from "./schemas";

export type RecordClipOptions = {
  playbackUrl: string;
  outputPath: string;
  durationSeconds: number;
  capturePlan?: ClipCapturePlan;
};

export type RecordClipResult = {
  outputPath: string;
  factoryPacket: ClipFactoryPacket | null;
  baseRecordingTiming: BaseRecordingTiming;
};

export async function recordClipViewport(
  options: RecordClipOptions,
): Promise<RecordClipResult> {
  const outputPath = path.resolve(options.outputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const capturePlan = options.capturePlan ?? createPhoneReplayCapturePlan();
  const viewport = capturePlan.viewport;
  const playbackRate = capturePlan.replay.playbackRate ?? DEFAULT_REPLAY_PLAYBACK_RATE;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    recordVideo: {
      dir: path.dirname(outputPath),
      size: viewport,
    },
  });

  const page = await context.newPage();
  try {
    await page.goto(options.playbackUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const factoryPacket = await waitForFactoryPacket(page);
    if (!factoryPacket) {
      await applyCapturePlan(page, capturePlan);
    }
    if (capturePlan.replay.autoplay) {
      await tryStartPlayback(page, capturePlan);
    }
    await page.waitForTimeout(options.durationSeconds * 1000);

    const video = page.video();
    if (!video) {
      throw new Error("Playwright did not create a video artifact.");
    }

    const saveVideo = video.saveAs(outputPath);
    await page.close();
    await context.close();
    await saveVideo;
    await browser.close();
    const baseRecordingTiming = await detectBaseRecordingTiming({
      videoPath: outputPath,
      clipDurationFrames: Math.max(
        1,
        Math.round(options.durationSeconds * TIKTOK_CANVAS.fps),
      ),
      playbackRate,
    });
    return { outputPath, factoryPacket, baseRecordingTiming };
  } catch (error) {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    throw error;
  }
}

async function applyCapturePlan(
  page: Page,
  capturePlan: ClipCapturePlan,
): Promise<void> {
  await page.evaluate(
    (css) => {
      const style = document.createElement("style");
      style.dataset.clipFactoryViewport = "true";
      style.textContent = css;
      document.head.appendChild(style);
    },
    capturePlanStyle(capturePlan),
  );
}

async function waitForFactoryPacket(page: Page): Promise<ClipFactoryPacket | null> {
  try {
    await page.waitForFunction(
      () => Boolean(window.clankerClip || window.__CLIP_FACTORY_READY__),
      undefined,
      { timeout: 15_000 },
    );
    const packet = await page.evaluate(async () => {
      if (window.clankerClip) return window.clankerClip.ready();
      return window.__CLIP_FACTORY_PACKET__ ?? null;
    });
    return packet ? parseClipFactoryPacketWire(packet) : null;
  } catch {
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    return null;
  }
}

async function tryStartPlayback(
  page: Page,
  capturePlan: ClipCapturePlan,
): Promise<void> {
  const usedApi = await page.evaluate(() => {
    if (!window.clankerClip) return false;
    window.clankerClip.play();
    return true;
  });
  if (usedApi) return;

  await page.evaluate((preferredPlaySelector) => {
    const selectors = [preferredPlaySelector, '[aria-label="Play"]', "video"];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLButtonElement) {
        element.click();
        return;
      }
      if (element instanceof HTMLVideoElement) {
        void element.play();
        return;
      }
    }

    const playButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.trim().toLowerCase().includes("play"),
    );
    playButton?.click();
  }, capturePlan.replay.preferredPlaySelector);
}

declare global {
  interface Window {
    __CLIP_FACTORY_READY__?: boolean;
    __CLIP_FACTORY_PACKET__?: ClipFactoryPacket;
    clankerClip?: {
      ready: () => Promise<ClipFactoryPacket>;
      packet: () => ClipFactoryPacket | null;
      play: () => void;
      pause: () => void;
      seek: (seconds: number) => void;
      duration: () => number;
      state: () => { playing: boolean; currentSeconds: number; durationSeconds: number };
    };
  }
}

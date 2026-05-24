import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import {
  DEFAULT_REPLAY_PLAYBACK_RATE,
  capturePlanStyle,
  createPhoneReplayCapturePlan,
} from "./capture-plan";
import type {
  BaseRecordingTiming,
  ChatCueTimingArtifact,
  ClipCapturePlan,
  ClipFactoryPacket,
} from "./edit-model";
import { TIKTOK_CANVAS } from "./edit-model";
import { detectBaseRecordingTiming } from "./base-recording-timing";
import { parseClipFactoryPacketWire } from "./schemas";
import {
  extractCroppedVideoFrames,
  meanAbsolutePixelDifference,
  type VideoProbeRect,
} from "./video-frame-probe";

const VISIBLE_CHAT_CUE_STABLE_FRAMES = 12;
const VIDEO_CUE_PROBE_LOOKBEHIND_FRAMES = 16;
const VIDEO_CUE_PROBE_LOOKAHEAD_FRAMES = 14;
const VIDEO_CUE_ANCHOR_OFFSET_FRAMES = 5;
// Playwright's recorder can encode a paint one frame after a crop first matches.
// The cue must never precede the highlighted row in the saved video.
const VIDEO_CUE_ENCODING_GUARD_FRAMES = 1;
const VIDEO_CUE_SIMILARITY_THRESHOLD = 10;

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
  chatCueTiming?: ChatCueTimingArtifact;
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
    if (factoryPacket) {
      await resetReplayForCueDetection(page);
      await installVisibleChatCueDetector(page, factoryPacket.messages, playbackRate);
    }
    if (capturePlan.replay.autoplay) {
      await showPlaybackStartMarker(page);
      await tryStartPlayback(page, capturePlan);
    }
    await page.waitForTimeout(options.durationSeconds * 1000);
    const detectedChatCueTiming = factoryPacket
      ? await readVisibleChatCueDetector(page, playbackRate)
      : undefined;

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
    const chatCueTiming =
      detectedChatCueTiming && baseRecordingTiming
        ? await withRecordingFrames(detectedChatCueTiming, baseRecordingTiming, outputPath)
        : detectedChatCueTiming;
    return { outputPath, factoryPacket, baseRecordingTiming, chatCueTiming };
  } catch (error) {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    throw error;
  }
}

async function showPlaybackStartMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    const existing = document.querySelector("[data-short-factory-start-marker]");
    existing?.remove();
    const marker = document.createElement("div");
    marker.dataset.shortFactoryStartMarker = "true";
    marker.style.position = "fixed";
    marker.style.left = "0";
    marker.style.top = "0";
    marker.style.width = "96px";
    marker.style.height = "96px";
    marker.style.background = "rgb(255, 0, 255)";
    marker.style.zIndex = "2147483647";
    marker.style.pointerEvents = "none";
    document.body.appendChild(marker);
  });
  await page.waitForTimeout(250);
}

async function resetReplayForCueDetection(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.clankerClip?.pause();
    window.clankerClip?.seek(0);
  });
  await page.waitForTimeout(120);
}

export async function installVisibleChatCueDetector(
  page: Page,
  messages: ClipFactoryPacket["messages"],
  playbackRate: number,
): Promise<void> {
  const detectorArgs = JSON.stringify({
    serializedMessages: messages.map((message) => ({
      id: message.id,
      text: message.text,
    })),
    fps: TIKTOK_CANVAS.fps,
    replayPlaybackRate: playbackRate,
    visibleCueStableFrames: VISIBLE_CHAT_CUE_STABLE_FRAMES,
  });

  await page.evaluate(`
    (() => {
      const {
        serializedMessages,
        fps,
        replayPlaybackRate,
        visibleCueStableFrames,
      } = ${detectorArgs};
      const targets = serializedMessages.map((message) => ({
        id: message.id,
        text: normalizeCueText(message.text),
      }));
      const detections = new Map();
      const visibleFrames = new Map();
      let startedAt = null;
      let ticking = false;

      function normalizeCueText(value) {
        return value.replace(/\\s+/g, " ").trim().toLowerCase();
      }

      function isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0.01
        );
      }

      function rectHasVisibleHit(parent, rect) {
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (
          rect.bottom <= 0 ||
          rect.top >= window.innerHeight ||
          rect.right <= 0 ||
          rect.left >= window.innerWidth
        ) {
          return false;
        }

        const parentRect = parent.getBoundingClientRect();
        const visibleWidth =
          Math.min(rect.right, parentRect.right, window.innerWidth) -
          Math.max(rect.left, parentRect.left, 0);
        const visibleHeight =
          Math.min(rect.bottom, parentRect.bottom, window.innerHeight) -
          Math.max(rect.top, parentRect.top, 0);
        if (visibleWidth < 4 || visibleHeight < 4) return false;

        const x = Math.max(
          0,
          Math.min(window.innerWidth - 1, rect.left + rect.width / 2),
        );
        const y = Math.max(
          0,
          Math.min(window.innerHeight - 1, rect.top + rect.height / 2),
        );
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && (hit === parent || parent.contains(hit) || hit.contains(parent)));
      }

      function clampVisualRect(rect) {
        const padding = 6;
        const left = Math.max(0, rect.left - padding);
        const top = Math.max(0, rect.top - padding);
        const right = Math.min(window.innerWidth, rect.right + padding);
        const bottom = Math.min(window.innerHeight, rect.bottom + padding);
        const width = right - left;
        const height = bottom - top;
        if (width < 2 || height < 2) return null;
        return { x: left, y: top, width, height };
      }

      function visibleTextNodeHit(node) {
        const parent = node.parentElement;
        if (!parent || !isElementVisible(parent)) return null;

        const range = document.createRange();
        range.selectNodeContents(node);
        try {
          const bounds =
            clampVisualRect(parent.getBoundingClientRect()) ??
            clampVisualRect(range.getBoundingClientRect());
          for (const rect of range.getClientRects()) {
            if (rectHasVisibleHit(parent, rect)) {
              return {
                text: node.textContent ?? "",
                rect: bounds ?? clampVisualRect(rect),
              };
            }
          }
        } finally {
          range.detach();
        }

        return null;
      }

      function visibleTextHit(target) {
        const needle = target.text.slice(0, 56);
        if (!needle) return null;
        const maxCandidateLength = Math.max(needle.length + 160, target.text.length + 80);
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let node = walker.nextNode();
        while (node) {
          const hit = visibleTextNodeHit(node);
          const text = normalizeCueText(hit?.text ?? "");
          if (hit && text.length <= maxCandidateLength && text.includes(needle)) return hit;
          node = walker.nextNode();
        }
        return null;
      }

      function currentSourceSeconds(detectedAtMs) {
        const state = window.clankerClip?.state();
        const duration = state?.durationSeconds ?? 0;
        const progress = state?.progress ?? 0;
        const progressSeconds = progress * duration;
        const elapsedSeconds = (detectedAtMs / 1000) * replayPlaybackRate;
        const sourceSeconds = progressSeconds > 0 ? progressSeconds : elapsedSeconds;
        const maxCueSeconds = duration > 0 ? duration + 2 : sourceSeconds;
        return Math.max(0, Math.min(maxCueSeconds, sourceSeconds));
      }

      function tick() {
        if (startedAt === null) return;
        for (const target of targets) {
          if (detections.has(target.id)) continue;
          const visibleHit = visibleTextHit(target);
          if (!visibleHit) {
            visibleFrames.delete(target.id);
            continue;
          }
          const nextVisibleFrames = (visibleFrames.get(target.id) ?? 0) + 1;
          visibleFrames.set(target.id, nextVisibleFrames);
          if (nextVisibleFrames < visibleCueStableFrames) continue;

          const stableDetectedAtMs = performance.now() - startedAt;
          const sourceSeconds = currentSourceSeconds(stableDetectedAtMs);
          detections.set(target.id, {
            messageId: target.id,
            sourceSeconds,
            sourceFrame: Math.max(0, Math.round(sourceSeconds * fps)),
            detectedAtMs: stableDetectedAtMs,
            screenRect: visibleHit.rect,
            method: "browser-visible",
          });
        }
        if (detections.size < targets.length) {
          requestAnimationFrame(tick);
        } else {
          ticking = false;
        }
      }

      window.__SHORT_FACTORY_CHAT_CUE_TIMING__ = {
        fps,
        playbackRate: replayPlaybackRate,
        messages: [],
      };
      window.__SHORT_FACTORY_START_CHAT_CUE_DETECTOR__ = () => {
        if (startedAt !== null) return;
        startedAt = performance.now();
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(tick);
        }
      };
      window.__SHORT_FACTORY_READ_CHAT_CUES__ = () => ({
        fps,
        playbackRate: replayPlaybackRate,
        messages: [...detections.values()],
      });
    })()
  `);
}

export async function readVisibleChatCueDetector(
  page: Page,
  playbackRate: number,
): Promise<ChatCueTimingArtifact> {
  const detected = await page.evaluate(() =>
    window.__SHORT_FACTORY_READ_CHAT_CUES__?.() ??
    window.__SHORT_FACTORY_CHAT_CUE_TIMING__ ??
    null,
  );
  return {
    fps: detected?.fps ?? TIKTOK_CANVAS.fps,
    playbackRate: detected?.playbackRate ?? playbackRate,
    messages: detected?.messages ?? [],
  };
}

async function withRecordingFrames(
  timing: ChatCueTimingArtifact,
  baseRecordingTiming: BaseRecordingTiming,
  videoPath: string,
): Promise<ChatCueTimingArtifact> {
  const messages = await Promise.all(
    timing.messages.map(async (message) => {
      const fallbackRecordingFrame = recordingFrameForChatCue(message, baseRecordingTiming);
      const recordingFrame =
        (await refineChatCueRecordingFrameFromVideo({
          message,
          videoPath,
          fallbackRecordingFrame,
          baseRecordingTiming,
        })) ?? fallbackRecordingFrame;
      const sourceFrame = sourceFrameForRecordingFrame(recordingFrame, baseRecordingTiming);
      return {
        ...message,
        sourceFrame,
        sourceSeconds: sourceFrame / Math.max(1, baseRecordingTiming.fps),
        recordingFrame,
      };
    }),
  );
  return {
    ...timing,
    messages,
  };
}

async function refineChatCueRecordingFrameFromVideo(args: {
  message: ChatCueTimingArtifact["messages"][number];
  videoPath: string;
  fallbackRecordingFrame: number;
  baseRecordingTiming: BaseRecordingTiming;
}): Promise<number | undefined> {
  const rect = normalizeCueProbeRect(args.message.screenRect);
  if (!rect) return undefined;

  const startFrame = Math.max(
    0,
    args.fallbackRecordingFrame - VIDEO_CUE_PROBE_LOOKBEHIND_FRAMES,
  );
  const endFrame = Math.min(
    args.baseRecordingTiming.recordedDurationFrames - 1,
    args.fallbackRecordingFrame + VIDEO_CUE_PROBE_LOOKAHEAD_FRAMES,
  );
  if (endFrame <= startFrame) return undefined;

  const frames = await extractCroppedVideoFrames({
    videoPath: args.videoPath,
    fps: args.baseRecordingTiming.fps,
    startFrame,
    endFrame,
    rect,
  });
  if (frames.length < 2) return undefined;

  const anchorFrame = Math.min(
    endFrame,
    args.fallbackRecordingFrame + VIDEO_CUE_ANCHOR_OFFSET_FRAMES,
  );
  const anchor =
    frames.find((frame) => frame.frame >= anchorFrame) ?? frames[frames.length - 1];
  if (!anchor) return undefined;

  for (const frame of frames) {
    const difference = meanAbsolutePixelDifference(frame.decoded, anchor.decoded);
    if (difference <= VIDEO_CUE_SIMILARITY_THRESHOLD) {
      return Math.min(endFrame, frame.frame + VIDEO_CUE_ENCODING_GUARD_FRAMES);
    }
  }

  return undefined;
}

function normalizeCueProbeRect(
  rect: ChatCueTimingArtifact["messages"][number]["screenRect"],
): VideoProbeRect | null {
  if (!rect) return null;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  if (width < 4 || height < 4) return null;
  return { x, y, width, height };
}

function sourceFrameForRecordingFrame(
  recordingFrame: number,
  baseRecordingTiming: BaseRecordingTiming,
): number {
  return Math.max(
    0,
    Math.round(
      (recordingFrame - baseRecordingTiming.clipStartFrame) *
        baseRecordingTiming.playbackRate,
    ),
  );
}

function recordingFrameForChatCue(
  message: ChatCueTimingArtifact["messages"][number],
  baseRecordingTiming: BaseRecordingTiming,
): number {
  const detectedAtMs = message.detectedAtMs;
  const frame =
    detectedAtMs !== undefined && Number.isFinite(detectedAtMs)
      ? baseRecordingTiming.clipStartFrame +
        (detectedAtMs / 1000) * baseRecordingTiming.fps
      : baseRecordingTiming.clipStartFrame +
        message.sourceFrame / baseRecordingTiming.playbackRate;
  return Math.max(
    0,
    Math.min(baseRecordingTiming.recordedDurationFrames - 1, Math.round(frame)),
  );
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
    document.querySelector("[data-short-factory-start-marker]")?.remove();
    window.__SHORT_FACTORY_START_CHAT_CUE_DETECTOR__?.();
    window.clankerClip.play();
    return true;
  });
  if (usedApi) return;

  await page.evaluate((preferredPlaySelector) => {
    const selectors = [preferredPlaySelector, '[aria-label="Play"]', "video"];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLButtonElement) {
        document.querySelector("[data-short-factory-start-marker]")?.remove();
        window.__SHORT_FACTORY_START_CHAT_CUE_DETECTOR__?.();
        element.click();
        return;
      }
      if (element instanceof HTMLVideoElement) {
        document.querySelector("[data-short-factory-start-marker]")?.remove();
        window.__SHORT_FACTORY_START_CHAT_CUE_DETECTOR__?.();
        void element.play();
        return;
      }
    }

    const playButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.trim().toLowerCase().includes("play"),
    );
    document.querySelector("[data-short-factory-start-marker]")?.remove();
    window.__SHORT_FACTORY_START_CHAT_CUE_DETECTOR__?.();
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
      state: () => {
        ready?: boolean;
        playing?: boolean;
        isPlaying?: boolean;
        currentSeconds?: number;
        progress?: number;
        durationSeconds: number;
      };
    };
    __SHORT_FACTORY_CHAT_CUE_TIMING__?: ChatCueTimingArtifact;
    __SHORT_FACTORY_START_CHAT_CUE_DETECTOR__?: () => void;
    __SHORT_FACTORY_READ_CHAT_CUES__?: () => ChatCueTimingArtifact;
  }
}

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { normalizeClipInput } from "../src/lib/clip-url";
import { rawSourceDurationFrames } from "../src/lib/composition-utils";
import {
  DEFAULT_TEMPLATE1_ID,
  applyDefaultTemplate1,
} from "../src/lib/default-template1";
import type {
  BaseRecordingTiming,
  ChatCueTimingArtifact,
} from "../src/lib/edit-model";
import { TIKTOK_CANVAS } from "../src/lib/edit-model";
import { jobDirectory } from "../src/lib/job-store";
import { normalizeFactoryPacketToQuoteJob } from "../src/lib/normalize-clip";
import {
  createJobRequestSchema,
  editCompositionSchema,
  parseClipFactoryPacketWire,
} from "../src/lib/schemas";
import {
  installVisibleChatCueDetector,
  readVisibleChatCueDetector,
} from "../src/lib/record-clip";
import { recordingFrameForOutputFrame } from "../src/lib/source-timeline";
import type { EditRecipeVariant, FactoryJob } from "../src/lib/types";
import { voiceForSpeaker } from "../src/lib/voice-registry";

const FPS = TIKTOK_CANVAS.fps;
const PLAYBACK_RATE = 4;
const FIRST_MESSAGE_ID = 101;
const TARGET_MESSAGE_ID = 202;
const TARGET_TEXT =
  "Freeze only when this exact highlighted chat row is visibly painted in the tray.";

const packet = parseClipFactoryPacketWire({
  version: 1,
  clipId: "template1-browser-cue",
  clipUrl: "https://clankerfights.ai/clip/template1-browser-cue",
  sourceUrl: "https://clankerfights.ai/clip/template1-browser-cue",
  playbackUrl: "https://clankerfights.ai/?clip=template1-browser-cue&factory=1",
  apiUrl: "https://clankerfights.ai/api/clips/template1-browser-cue",
  game: "browser-test",
  gameRevisionId: "rev-template1-browser",
  durationSeconds: 6,
  trimStartMs: 0,
  trimEndMs: 6000,
  highlightedChatIds: [TARGET_MESSAGE_ID],
  players: [{ id: "model-a", name: "Qwen-Duchess" }],
  transcript: [
    {
      id: FIRST_MESSAGE_ID,
      speaker: "Qwen-Duchess",
      playerId: "model-a",
      identity: {
        kind: "player",
        playerId: "model-a",
        displayName: "Qwen-Duchess",
        stableAgentId: "agent:qwen-duchess",
        modelName: "qwen",
      },
      channel: "room",
      text: "The setup chat row is visible first.",
      timestampMs: 800,
      startSeconds: 0.8,
      endSeconds: 1.4,
      highlighted: false,
      timingConfidence: "exact",
    },
    {
      id: TARGET_MESSAGE_ID,
      speaker: "Qwen-Duchess",
      playerId: "model-a",
      identity: {
        kind: "player",
        playerId: "model-a",
        displayName: "Qwen-Duchess",
        stableAgentId: "agent:qwen-duchess",
        modelName: "qwen",
      },
      channel: "room",
      text: TARGET_TEXT,
      timestampMs: 3000,
      startSeconds: 3,
      endSeconds: 3.8,
      highlighted: true,
      timingConfidence: "exact",
    },
  ],
  messages: [
    {
      id: FIRST_MESSAGE_ID,
      speaker: "Qwen-Duchess",
      playerId: "model-a",
      channel: "room",
      text: "The setup chat row is visible first.",
      timestampMs: 800,
      startSeconds: 0.8,
      endSeconds: 1.4,
      highlighted: false,
      timingConfidence: "exact",
    },
    {
      id: TARGET_MESSAGE_ID,
      speaker: "Qwen-Duchess",
      playerId: "model-a",
      channel: "room",
      text: TARGET_TEXT,
      timestampMs: 3000,
      startSeconds: 3,
      endSeconds: 3.8,
      highlighted: true,
      timingConfidence: "exact",
    },
  ],
  highlightedMessages: [
    {
      id: TARGET_MESSAGE_ID,
      speaker: "Qwen-Duchess",
      playerId: "model-a",
      channel: "room",
      text: TARGET_TEXT,
      timestampMs: 3000,
      startSeconds: 3,
      endSeconds: 3.8,
      highlighted: true,
      timingConfidence: "exact",
    },
  ],
  capturePlan: {
    id: "phone-fit-replay-v1",
    viewport: { width: 540, height: 960 },
    replayLayoutWidth: 540,
    chatHeightPct: 40,
    readinessSignal: "window.clankerClip.ready()",
    playbackApiGlobal: "window.clankerClip",
    autoplay: true,
    startAtTrimStart: true,
  },
  projectionSummary: {
    perspective: { kind: "spectator", playerId: null, name: null },
    clipStartTimestamp: 0,
    clipEndTimestamp: 6000,
    clipDurationMs: 6000,
    eventCount: 2,
    segmentCount: 1,
    segmentBoundaries: [],
  },
  safeAreas: {
    viewport: { width: 540, height: 960 },
    replay: { x: 0, y: 0, width: 540, height: 960 },
    captions: { x: 36, y: 580, width: 468, height: 300 },
  },
  clockMap: {
    recordingStartMs: 0,
    recordingEndMs: 6000,
    playbackStartSeconds: 0,
    playbackDurationSeconds: 6,
  },
  editManifest: { schemaVersion: 1 },
});

validateTemplate1BrowserTiming()
  .then(() => {
    console.log("Default template1 browser timing validation passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function validateTemplate1BrowserTiming(): Promise<void> {
  assert.doesNotThrow(() =>
    createJobRequestSchema.parse({
      clipUrl: packet.clipUrl,
      hookText: "Hook",
      finalMessageTone: "Dry and certain.",
      clipPlaybackSpeed: 32,
    }),
  );

  const timing = await detectBrowserVisibleCues();
  const firstCue = requireCue(timing, FIRST_MESSAGE_ID);
  const targetCue = requireCue(timing, TARGET_MESSAGE_ID);
  assert.ok(targetCue.sourceFrame > firstCue.sourceFrame);
  assert.ok(targetCue.sourceSeconds >= 2.8);

  const baseRecordingTiming: BaseRecordingTiming = {
    fps: FPS,
    recordedDurationFrames: 240,
    clipStartFrame: 12,
    clipEndFrame: 80,
    clipDurationFrames: packet.durationSeconds * FPS,
    playbackRate: PLAYBACK_RATE,
    method: "backfill-detection",
    confidence: "high",
  };
  const timingWithRecordingFrames = withRecordingFrames(timing, baseRecordingTiming);
  const targetCueWithRecording = requireCue(
    timingWithRecordingFrames,
    TARGET_MESSAGE_ID,
  );
  const jobId = randomUUID();
  const dir = jobDirectory(jobId);
  await fs.rm(dir, { recursive: true, force: true });

  try {
    const job = await createTemplateJob({
      jobId,
      timing: timingWithRecordingFrames,
      baseRecordingTiming,
    });
    const variant = job.editRecipe.variants[0];
    assert.ok(variant);
    await writeTemplate1SpeechStub({
      jobId,
      id: "tts-default-template1-hook",
      text: variant.setupLine || variant.openingCaption,
      speaker: "Narrator",
    });
    await writeTemplate1SpeechStub({
      jobId,
      id: `tts-highlight-${TARGET_MESSAGE_ID}`,
      text: TARGET_TEXT,
      speaker: "Qwen-Duchess",
    });

    const outputStartFrames: number[] = [];
    for (const speed of [1, 2, 16, 32]) {
      const speedJob = {
        ...job,
        quoteJob: {
          ...job.quoteJob,
          clipPlaybackSpeed: speed,
        },
      };
      const composition = await applyDefaultTemplate1(speedJob, { ...variant });
      assert.doesNotThrow(() => editCompositionSchema.parse(composition));
      assert.equal(composition.templateId, DEFAULT_TEMPLATE1_ID);
      assert.equal(composition.timelineEdits?.playback?.speed, speed);

      const trim = composition.timelineEdits?.trim;
      assert.ok(trim);
      const freezes = composition.timelineEdits?.freezes ?? [];
      const freeze = freezes.find(
        (candidate) => candidate.id === `freeze-highlight-${TARGET_MESSAGE_ID}`,
      );
      assert.ok(freeze);
      assert.equal(trim.startFrame + freeze.atFrame, targetCue.sourceFrame);
      assert.equal(freeze.recordingFrame, targetCueWithRecording.recordingFrame);

      const videoLayer = composition.layers.find((layer) => layer.id === "base-recording");
      const speechLayer = composition.layers.find(
        (layer) => layer.id === `tts-highlight-${TARGET_MESSAGE_ID}`,
      );
      assert.ok(videoLayer);
      assert.ok(speechLayer);
      const outputFrame = speechLayer.time.start - videoLayer.time.start;
      outputStartFrames.push(speechLayer.time.start);
      assert.ok(targetCueWithRecording.recordingFrame !== undefined);
      assertFrameClose(
        recordingFrameForOutputFrame({
          outputFrame,
          freezes,
          playback: composition.timelineEdits?.playback,
          trim,
          sourceDurationFrames: rawSourceDurationFrames(composition),
          baseVideoTiming: baseRecordingTiming,
          fps: FPS,
        }),
        targetCueWithRecording.recordingFrame,
        `speed ${speed}x should map highlight read to the detected recording frame`,
      );
    }
    assert.ok(outputStartFrames[0] > outputStartFrames[outputStartFrames.length - 1]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function detectBrowserVisibleCues(): Promise<ChatCueTimingArtifact> {
  return withFixtureServer(async (playbackUrl) => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 540, height: 960 },
    });

    try {
      await page.goto(playbackUrl, { waitUntil: "domcontentloaded" });
      await installVisibleChatCueDetector(page, packet.messages, PLAYBACK_RATE);
      await page.evaluate(() => {
        window.__SHORT_FACTORY_START_CHAT_CUE_DETECTOR__?.();
        window.clankerClip?.play();
      });
      await page.waitForTimeout(250);
      const earlyTiming = await readVisibleChatCueDetector(page, PLAYBACK_RATE);
      assert.equal(
        earlyTiming.messages.some((message) => message.messageId === TARGET_MESSAGE_ID),
        false,
      );

      await page.waitForTimeout(1200);
      return await readVisibleChatCueDetector(page, PLAYBACK_RATE);
    } finally {
      await browser.close();
    }
  });
}

async function withFixtureServer<T>(
  run: (playbackUrl: string) => Promise<T>,
): Promise<T> {
  const server = http.createServer((request, response) => {
    if (!request.url?.startsWith("/clip")) {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port.");
  }

  try {
    return await run(`http://127.0.0.1:${address.port}/clip`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function fixtureHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        width: 540px;
        height: 960px;
        margin: 0;
        overflow: hidden;
        background: #05070a;
        font-family: Arial, sans-serif;
      }

      #preloaded-transcript {
        position: absolute;
        top: 4px;
        left: 4px;
        width: 1px;
        height: 1px;
        overflow: hidden;
        white-space: nowrap;
        color: #ffffff;
        background: #ffffff;
      }

      #chat {
        position: absolute;
        left: 24px;
        right: 24px;
        bottom: 48px;
        height: 320px;
        overflow: hidden;
        border-radius: 8px;
        background: rgba(12, 16, 24, 0.96);
      }

      .message {
        margin: 12px;
        padding: 12px;
        border-radius: 6px;
        color: #ffffff;
        background: #242b3a;
        font-size: 18px;
        line-height: 1.28;
      }

      .message.highlighted {
        outline: 4px solid #ffdf47;
      }
    </style>
  </head>
  <body>
    <div id="preloaded-transcript">${escapeHtml(TARGET_TEXT)}</div>
    <div id="chat"></div>
    <script>
      const packet = ${JSON.stringify(packet)};
      const playbackRate = ${PLAYBACK_RATE};
      const durationSeconds = packet.durationSeconds;
      const chat = document.getElementById("chat");
      let currentSeconds = 0;
      let playing = false;
      let lastTickMs = performance.now();

      function syncClock() {
        if (!playing) return;
        const now = performance.now();
        currentSeconds = Math.min(
          durationSeconds,
          currentSeconds + ((now - lastTickMs) / 1000) * playbackRate,
        );
        lastTickMs = now;
      }

      function renderChat() {
        syncClock();
        chat.textContent = "";
        for (const message of packet.messages) {
          if (currentSeconds < message.startSeconds) continue;
          const row = document.createElement("div");
          row.className = message.highlighted ? "message highlighted" : "message";
          row.textContent = message.text;
          chat.appendChild(row);
        }

        if (playing && currentSeconds < durationSeconds) {
          requestAnimationFrame(renderChat);
        }
      }

      window.clankerClip = {
        ready: async () => packet,
        packet: () => packet,
        play: () => {
          syncClock();
          playing = true;
          lastTickMs = performance.now();
          requestAnimationFrame(renderChat);
        },
        pause: () => {
          syncClock();
          playing = false;
        },
        seek: (seconds) => {
          currentSeconds = Math.max(0, Math.min(durationSeconds, Number(seconds) || 0));
          lastTickMs = performance.now();
          renderChat();
        },
        duration: () => durationSeconds,
        state: () => {
          syncClock();
          return {
            ready: true,
            playing,
            currentSeconds,
            progress: currentSeconds / durationSeconds,
            durationSeconds,
          };
        },
      };
      renderChat();
    </script>
  </body>
</html>`;
}

async function createTemplateJob(args: {
  jobId: string;
  timing: ChatCueTimingArtifact;
  baseRecordingTiming: BaseRecordingTiming;
}): Promise<FactoryJob> {
  const quoteJob = normalizeFactoryPacketToQuoteJob({
    packet,
    source: normalizeClipInput(packet.clipUrl),
    hookText: "This clip has one exact highlighted chat cue",
    finalMessageTone: "Dry and certain.",
    finalMessageVoiceInstructions: "Deadpan confidence.",
    selectedTemplateId: DEFAULT_TEMPLATE1_ID,
    clipPlaybackSpeed: 2,
  });
  const variant: EditRecipeVariant = {
    variantId: "v1",
    template: "narrator_quote_punchline",
    templateId: DEFAULT_TEMPLATE1_ID,
    setupLine: quoteJob.hookText ?? "This clip has one exact highlighted chat cue",
    openingCaption: quoteJob.hookText ?? "This clip has one exact highlighted chat cue",
    speaker: "Qwen-Duchess",
    speakerExpression: "intense",
    quoteText: TARGET_TEXT,
    punchlinePhrase: "visible cue",
    highlightPhrases: ["visibly painted"],
    captionStyle: "dramatic",
    cta: "Play Clankerfights",
  };

  return {
    id: args.jobId,
    createdAt: new Date(0).toISOString(),
    status: {
      ingest: "complete",
      recipe: "complete",
      recording: "complete",
      render: "pending",
    },
    quoteJob,
    editRecipe: {
      sourceClipId: packet.clipId,
      variants: [variant],
    },
    artifacts: {
      baseRecordingTiming: args.baseRecordingTiming,
      chatCueTiming: args.timing,
    },
  };
}

function requireCue(
  timing: ChatCueTimingArtifact,
  messageId: number,
): ChatCueTimingArtifact["messages"][number] {
  const cue = timing.messages.find((message) => message.messageId === messageId);
  assert.ok(cue, `Expected browser-visible timing for message ${messageId}.`);
  return cue;
}

function withRecordingFrames(
  timing: ChatCueTimingArtifact,
  baseRecordingTiming: BaseRecordingTiming,
): ChatCueTimingArtifact {
  return {
    ...timing,
    messages: timing.messages.map((message) => ({
      ...message,
      recordingFrame: recordingFrameForChatCue(message, baseRecordingTiming),
    })),
  };
}

function recordingFrameForChatCue(
  message: ChatCueTimingArtifact["messages"][number],
  baseRecordingTiming: BaseRecordingTiming,
): number {
  const frame =
    message.detectedAtMs !== undefined && Number.isFinite(message.detectedAtMs)
      ? baseRecordingTiming.clipStartFrame +
        (message.detectedAtMs / 1000) * baseRecordingTiming.fps
      : baseRecordingTiming.clipStartFrame +
        message.sourceFrame / baseRecordingTiming.playbackRate;
  return Math.max(
    0,
    Math.min(baseRecordingTiming.recordedDurationFrames - 1, Math.round(frame)),
  );
}

function assertFrameClose(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) <= 1,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

async function writeTemplate1SpeechStub(args: {
  jobId: string;
  id: string;
  text: string;
  speaker: string;
}): Promise<void> {
  const profile = voiceForSpeaker(args.speaker);
  const relativePath = path.join(
    "assets",
    "tts",
    `${safeFileName(args.id)}-${speechSettingsHash(
      args.text,
      profile.voice,
      profile.instructions,
    )}.mp3`,
  );
  const absolutePath = path.join(jobDirectory(args.jobId), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, "template1 browser validation audio stub");
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]/gi, "_").slice(0, 80) || "tts";
}

function speechSettingsHash(text: string, voice: string, instructions: string): string {
  return createHash("sha1")
    .update(JSON.stringify({ text, voice, instructions }))
    .digest("hex")
    .slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

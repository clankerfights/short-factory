import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { bundle } from "@remotion/bundler";
import { RenderInternals, renderStill, selectComposition } from "@remotion/renderer";
import { normalizeClipInput } from "../src/lib/clip-url";
import { createPhoneReplayCapturePlan } from "../src/lib/capture-plan";
import {
  DEFAULT_TEMPLATE_ID,
  applyDefaultTemplate,
} from "../src/lib/default-template";
import type {
  BaseRecordingTiming,
  ChatCueTimingArtifact,
  ClipCapturePlan,
} from "../src/lib/edit-model";
import { TIKTOK_CANVAS } from "../src/lib/edit-model";
import { jobDirectory } from "../src/lib/job-store";
import { normalizeFactoryPacketToQuoteJob } from "../src/lib/normalize-clip";
import { recordClipViewport } from "../src/lib/record-clip";
import { renderRawClipVideo } from "../src/lib/render-recipe";
import {
  editCompositionSchema,
  parseClipFactoryPacketWire,
} from "../src/lib/schemas";
import {
  recordingFrameForOutputFrame,
} from "../src/lib/source-timeline";
import type {
  ClipFactoryPacketWire,
  EditRecipeVariant,
  FactoryJob,
} from "../src/lib/types";
import { voiceForSpeaker } from "../src/lib/voice-registry";

const FPS = TIKTOK_CANVAS.fps;
const FIRST_MESSAGE_ID = 101;
const TARGET_MESSAGE_ID = 202;
const TARGET_TEXT =
  "The exact highlighted row is visible now and this green cue marks its painted frame.";
const FRAME_TOLERANCE = 2;
const MAX_VISIBLE_CUE_LAG_FRAMES = 6;
const REPLAY_RATES = [1, 2, 32] as const;
const SHORT_FACTORY_SPEEDS = [1, 2, 3, 4, 6, 8, 10, 16, 32] as const;
const PROBE_WIDTH = 54;
const PROBE_HEIGHT = 96;
const GREEN_MARKER_MIN_PIXELS = 12;

validateHighlightCueE2E()
  .then(() => {
    console.log("Highlight cue recorded-frame E2E passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function validateHighlightCueE2E(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "short-factory-highlight-cue-"));
  const jobDirs: string[] = [];
  try {
    await withFixtureServer(async (origin) => {
      let renderCase: RecordedFixture | undefined;
      for (const replayRate of REPLAY_RATES) {
        const recorded = await recordFixture({
          origin,
          replayRate,
          tmp,
        });
        jobDirs.push(recorded.jobDir);
        await assertRecordedCueIsActualVideoFrame(recorded);
        renderCase ??= recorded;
      }

      assert.ok(renderCase);
      await assertTemplateRendersPinnedRecordedFrame(renderCase);
    });
  } finally {
    await Promise.all(jobDirs.map((jobDir) => fs.rm(jobDir, { recursive: true, force: true })));
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

type RecordedFixture = {
  job: FactoryJob;
  variant: EditRecipeVariant;
  packet: ClipFactoryPacketWire;
  baseRecordingPath: string;
  baseRecordingTiming: BaseRecordingTiming;
  chatCueTiming: ChatCueTimingArtifact;
  targetVideoFrame: number;
  jobDir: string;
};

async function recordFixture(args: {
  origin: string;
  replayRate: number;
  tmp: string;
}): Promise<RecordedFixture> {
  const jobId = randomUUID();
  const jobDir = jobDirectory(jobId);
  await fs.rm(jobDir, { recursive: true, force: true });
  await fs.mkdir(jobDir, { recursive: true });

  const packet = packetForFixture(args.origin, args.replayRate);
  const packetPath = path.join(jobDir, "factory-packet.json");
  await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");

  const capturePlan = capturePlanForReplayRate(args.replayRate);
  const baseRecordingPath = path.join(jobDir, "base-recording.webm");
  const result = await recordClipViewport({
    playbackUrl: packet.playbackUrl,
    outputPath: baseRecordingPath,
    durationSeconds: 4.8,
    capturePlan,
  });
  assert.ok(result.chatCueTiming, `expected browser-visible cue timing at ${args.replayRate}x`);

  const targetVideoFrame = await firstGreenMarkerFrame(result.outputPath);
  assert.notEqual(
    targetVideoFrame,
    null,
    `expected target marker to appear in actual recorded pixels at ${args.replayRate}x`,
  );

  const quoteJob = normalizeFactoryPacketToQuoteJob({
    packet,
    source: normalizeClipInput(packet.clipUrl),
    hookText: "Visible-frame timing must beat transcript timing",
    selectedTemplateId: DEFAULT_TEMPLATE_ID,
    clipPlaybackSpeed: 2,
  });
  const variant: EditRecipeVariant = {
    variantId: "v1",
    template: "narrator_quote_punchline",
    templateId: DEFAULT_TEMPLATE_ID,
    setupLine: quoteJob.hookText ?? "Visible-frame timing must beat transcript timing",
    openingCaption: quoteJob.hookText ?? "Visible-frame timing must beat transcript timing",
    speaker: "Qwen-Duchess",
    speakerExpression: "intense",
    quoteText: TARGET_TEXT,
    punchlinePhrase: "painted frame",
    highlightPhrases: ["visible now"],
    captionStyle: "dramatic",
    cta: "Play Clankerfights",
  };
  const job: FactoryJob = {
    id: jobId,
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
      baseRecordingPath: result.outputPath,
      baseRecordingTiming: result.baseRecordingTiming,
      chatCueTiming: result.chatCueTiming,
      factoryPacketPath: packetPath,
      rawVideoPath: path.join(jobDir, "raw.mp4"),
    },
  };

  await writeDefaultSpeechStub({
    jobId,
    id: "tts-default-hook",
    text: variant.setupLine || variant.openingCaption,
    speaker: "Narrator",
  });
  await writeDefaultSpeechStub({
    jobId,
    id: `tts-highlight-${TARGET_MESSAGE_ID}`,
    text: TARGET_TEXT,
    speaker: "Qwen-Duchess",
  });
  await fs.cp(path.join(process.cwd(), "assets"), path.join(jobDir, "assets"), {
    recursive: true,
    force: true,
  });

  return {
    job,
    variant,
    packet,
    baseRecordingPath: result.outputPath,
    baseRecordingTiming: result.baseRecordingTiming,
    chatCueTiming: result.chatCueTiming,
    targetVideoFrame: targetVideoFrame as number,
    jobDir,
  };
}

async function assertRecordedCueIsActualVideoFrame(
  recorded: RecordedFixture,
): Promise<void> {
  const targetCue = requireCue(recorded.chatCueTiming, TARGET_MESSAGE_ID);
  assert.ok(
    targetCue.recordingFrame !== undefined,
    "browser-visible cue should be annotated with the recorded video frame",
  );
  assertNotBeforeVisibleFrame(
    targetCue.recordingFrame,
    recorded.targetVideoFrame,
    `browser-visible cue recordingFrame should not precede the actual recorded pixels at ${recorded.baseRecordingTiming.playbackRate}x replay`,
  );

}

async function assertTemplateRendersPinnedRecordedFrame(
  recorded: RecordedFixture,
): Promise<void> {
  const rawOutput = await renderRawClipVideo({
    job: recorded.job,
    baseRecordingPath: recorded.baseRecordingPath,
    outputPath: recorded.job.artifacts.rawVideoPath ?? path.join(recorded.jobDir, "raw.mp4"),
  });
  const rawMarkerFrame = await firstGreenMarkerFrame(rawOutput);
  assert.notEqual(rawMarkerFrame, null, "raw render should preserve the actual green cue frame");

  const serveUrl = await bundle({
    entryPoint: path.join(process.cwd(), "src", "remotion", "index.tsx"),
    publicDir: recorded.jobDir,
  });

  for (const speed of SHORT_FACTORY_SPEEDS) {
    const jobForSpeed: FactoryJob = {
      ...recorded.job,
      quoteJob: {
        ...recorded.job.quoteJob,
        clipPlaybackSpeed: speed,
      },
    };
    const variantForSpeed: EditRecipeVariant = {
      ...recorded.variant,
      composition: undefined,
    };
    const composition = await applyDefaultTemplate(jobForSpeed, variantForSpeed);
    assert.doesNotThrow(() => editCompositionSchema.parse(composition));
    assert.equal(composition.templateId, DEFAULT_TEMPLATE_ID);

    const freeze = composition.timelineEdits?.freezes?.find(
      (candidate) => candidate.id === `freeze-highlight-${TARGET_MESSAGE_ID}`,
    );
    assert.ok(freeze, `speed ${speed}x should create a freeze for the highlighted cue`);
  assertFrameClose(
      freeze.recordingFrame,
      recorded.targetVideoFrame,
      `speed ${speed}x freeze should preserve the actual recorded highlight frame`,
    );

    const videoLayer = composition.layers.find((layer) => layer.id === "base-recording");
    const ttsLayer = composition.layers.find(
      (layer) => layer.id === `tts-highlight-${TARGET_MESSAGE_ID}`,
    );
    assert.ok(videoLayer);
    assert.ok(ttsLayer);
    const outputFrame = ttsLayer.time.start - videoLayer.time.start;
    assertFrameClose(
      recordingFrameForOutputFrame({
        outputFrame,
        freezes: composition.timelineEdits?.freezes,
        playback: composition.timelineEdits?.playback,
        trim: composition.timelineEdits?.trim,
        sourceDurationFrames: videoLayer.time.duration,
        baseVideoTiming: recorded.baseRecordingTiming,
        fps: FPS,
      }),
      recorded.targetVideoFrame,
      `speed ${speed}x first TTS frame should resolve to the actual recorded highlight frame`,
    );

    const inputProps = {
      baseVideoSrc: path.basename(recorded.baseRecordingPath),
      baseVideoTiming: recorded.baseRecordingTiming,
      variant: {
        ...variantForSpeed,
        composition,
      },
    };
    const selected = await selectComposition({
      serveUrl,
      id: "narrator-quote-punchline",
      inputProps,
    });
    const output = path.join(recorded.jobDir, `highlight-freeze-${speed}x.png`);
    await renderStill({
      serveUrl,
      composition: {
        ...selected,
        durationInFrames: composition.canvas.durationFrames,
      },
      inputProps,
      frame: ttsLayer.time.start,
      output,
    });
    assert.equal(
      await imageHasGreenMarker(output),
      true,
      `speed ${speed}x rendered freeze should visibly contain the highlighted chat marker`,
    );
  }
}

function assertNotBeforeVisibleFrame(
  actual: number | undefined | null,
  firstVisibleFrame: number | undefined | null,
  message: string,
): void {
  assert.ok(actual !== undefined && actual !== null, `${message}: missing actual frame`);
  assert.ok(
    firstVisibleFrame !== undefined && firstVisibleFrame !== null,
    `${message}: missing first visible frame`,
  );
  assert.ok(
    actual >= firstVisibleFrame,
    `${message}: expected at or after ${firstVisibleFrame}, got ${actual}`,
  );
  assert.ok(
    actual <= firstVisibleFrame + MAX_VISIBLE_CUE_LAG_FRAMES,
    `${message}: expected within ${MAX_VISIBLE_CUE_LAG_FRAMES} frames of ${firstVisibleFrame}, got ${actual}`,
  );
}

function packetForFixture(origin: string, replayRate: number): ClipFactoryPacketWire {
  const playbackUrl = `${origin}/clip?replayRate=${encodeURIComponent(String(replayRate))}`;
  return parseClipFactoryPacketWire({
    version: 1,
    clipId: `highlight-cue-e2e-${replayRate}x`,
    clipUrl: `${origin}/clip/highlight-cue-e2e-${replayRate}x`,
    sourceUrl: `${origin}/clip/highlight-cue-e2e-${replayRate}x`,
    playbackUrl,
    apiUrl: `${origin}/api/clips/highlight-cue-e2e-${replayRate}x`,
    game: "timing-test",
    gameRevisionId: "rev-highlight-cue-e2e",
    durationSeconds: 3.5,
    trimStartMs: 0,
    trimEndMs: 3500,
    highlightedChatIds: [TARGET_MESSAGE_ID],
    players: [{ id: "model-a", name: "Qwen-Duchess" }],
    transcript: transcriptRows(),
    messages: transcriptRows(),
    highlightedMessages: transcriptRows().filter((message) => message.highlighted),
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
      clipEndTimestamp: 3500,
      clipDurationMs: 3500,
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
      recordingEndMs: 3500,
      playbackStartSeconds: 0,
      playbackDurationSeconds: 3.5,
    },
    editManifest: { schemaVersion: 1 },
  });
}

function transcriptRows() {
  return [
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
      text: "The first visible chat row starts the gameplay clip.",
      timestampMs: 500,
      startSeconds: 0.5,
      endSeconds: 1.2,
      highlighted: false,
      timingConfidence: "exact" as const,
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
      timestampMs: 2100,
      startSeconds: 2.1,
      endSeconds: 2.9,
      highlighted: true,
      timingConfidence: "exact" as const,
    },
  ];
}

function capturePlanForReplayRate(replayRate: number): ClipCapturePlan {
  const plan = createPhoneReplayCapturePlan(540);
  return {
    ...plan,
    replay: {
      ...plan.replay,
      playbackRate: replayRate,
    },
  };
}

async function withFixtureServer<T>(
  run: (origin: string) => Promise<T>,
): Promise<T> {
  const server = http.createServer((request, response) => {
    if (!request.url?.startsWith("/clip")) {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");
    const replayRate = Number(url.searchParams.get("replayRate") ?? "1");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml(Number.isFinite(replayRate) ? replayRate : 1));
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
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function fixtureHtml(replayRate: number): string {
  const packet = packetForFixture("http://127.0.0.1", replayRate);
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

      #game {
        position: absolute;
        inset: 0 0 380px 0;
        background: #f8fafc;
        color: #111827;
        display: grid;
        place-items: center;
        font-size: 28px;
        font-weight: 800;
      }

      #chat {
        position: absolute;
        left: 20px;
        right: 20px;
        bottom: 32px;
        height: 320px;
        overflow: hidden;
        border-radius: 8px;
        background: rgba(12, 16, 24, 0.98);
      }

      .message {
        margin: 16px;
        padding: 14px;
        border-radius: 8px;
        color: #ffffff;
        background: #242b3a;
        font-size: 20px;
        line-height: 1.25;
      }

      .message.highlighted {
        background: linear-gradient(90deg, rgb(0, 255, 64) 0 54px, #242b3a 54px 100%);
        outline: 5px solid #8b5cf6;
        padding-left: 70px;
      }
    </style>
  </head>
  <body>
    <div id="game">Replay frame truth fixture</div>
    <div id="chat"></div>
    <script>
      const packet = ${JSON.stringify(packet)};
      const replayRate = ${JSON.stringify(replayRate)};
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
          currentSeconds + ((now - lastTickMs) / 1000) * replayRate,
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
            isPlaying: playing,
            currentSeconds,
            progress: currentSeconds / durationSeconds,
            durationSeconds,
          };
        },
      };
      window.__CLIP_FACTORY_READY__ = true;
      renderChat();
    </script>
  </body>
</html>`;
}

async function firstGreenMarkerFrame(videoPath: string): Promise<number | null> {
  const probeDir = await fs.mkdtemp(path.join(os.tmpdir(), "short-factory-green-probe-"));
  try {
    await runFfmpeg([
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      `scale=w=${PROBE_WIDTH}:h=${PROBE_HEIGHT}`,
      "-r",
      String(FPS),
      path.join(probeDir, "frame-%05d.png"),
    ]);
    const entries = (await fs.readdir(probeDir))
      .filter((entry) => entry.endsWith(".png"))
      .sort();
    for (let frame = 0; frame < entries.length; frame += 1) {
      const decoded = decodePng(await fs.readFile(path.join(probeDir, entries[frame])));
      if (greenMarkerPixels(decoded) >= GREEN_MARKER_MIN_PIXELS) return frame;
    }
    return null;
  } finally {
    await fs.rm(probeDir, { recursive: true, force: true });
  }
}

async function imageHasGreenMarker(imagePath: string): Promise<boolean> {
  const png = await runFfmpeg([
    "-v",
    "error",
    "-i",
    imagePath,
    "-vf",
    `scale=w=${PROBE_WIDTH}:h=${PROBE_HEIGHT}`,
    "-frames:v",
    "1",
    "-c:v",
    "png",
    "-f",
    "image2pipe",
    "-",
  ]);
  return greenMarkerPixels(decodePng(png)) >= GREEN_MARKER_MIN_PIXELS;
}

function greenMarkerPixels(decoded: {
  channels: number;
  pixels: Uint8Array;
}): number {
  let greenPixels = 0;
  for (let offset = 0; offset + 2 < decoded.pixels.length; offset += decoded.channels) {
    const red = decoded.pixels[offset];
    const green = decoded.pixels[offset + 1];
    const blue = decoded.pixels[offset + 2];
    if (red <= 80 && green >= 180 && blue <= 130) greenPixels += 1;
  }
  return greenPixels;
}

function decodePng(png: Buffer): {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
} {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  let bitDepth = 8;
  let idat = Buffer.alloc(0);
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idat = Buffer.concat([idat, data]);
    offset += 12 + length;
  }

  if (bitDepth !== 8 || ![0, 2, 6].includes(colorType)) {
    throw new Error("Unsupported PNG probe frame.");
  }

  const channels = colorType === 0 ? 1 : colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(idat);
  const pixels = new Uint8Array(stride * height);
  let sourceOffset = 0;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = rowIndex * stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset + column];
      const left = column >= channels ? pixels[rowStart + column - channels] : 0;
      const up = rowIndex > 0 ? pixels[rowStart + column - stride] : 0;
      const upLeft =
        rowIndex > 0 && column >= channels
          ? pixels[rowStart + column - stride - channels]
          : 0;
      pixels[rowStart + column] = unfilterByte(filter, raw, left, up, upLeft);
    }
    sourceOffset += stride;
  }
  return { width, height, channels, pixels };
}

function unfilterByte(
  filter: number,
  raw: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

async function runFfmpeg(args: string[]): Promise<Buffer> {
  const ffmpegPath = RenderInternals.getExecutablePath({
    type: "ffmpeg",
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
  });
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8") || `ffmpeg exited ${code}`));
    });
  });
}

function requireCue(
  timing: ChatCueTimingArtifact,
  messageId: number,
): ChatCueTimingArtifact["messages"][number] {
  const cue = timing.messages.find((message) => message.messageId === messageId);
  assert.ok(cue, `expected browser-visible timing for message ${messageId}`);
  return cue;
}

function assertFrameClose(
  actual: number | undefined | null,
  expected: number | undefined | null,
  message: string,
): void {
  assert.ok(actual !== undefined && actual !== null, `${message}: missing actual frame`);
  assert.ok(expected !== undefined && expected !== null, `${message}: missing expected frame`);
  assert.ok(
    Math.abs(actual - expected) <= FRAME_TOLERANCE,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

async function writeDefaultSpeechStub(args: {
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
  await fs.writeFile(absolutePath, "highlight cue e2e audio stub");
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

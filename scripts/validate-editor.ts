import assert from "node:assert/strict";
import { buildNarratorQuoteComposition } from "../src/lib/composition-builder";
import { chatGameplayStartFrame, highlightedChatReadFrame } from "../src/lib/chat-cue-timing";
import {
  ensureUniqueCompositionIds,
  normalizeFreezes,
  outputDurationForTimelineEdits,
  outputFrameForSourceFrame,
  rawFrameToSourceFrame,
  sortedLayers,
  sourceFrameForOutputFrame,
  sourceFrameToRawFrame,
  upsertCompositionLayer,
  withFreezeEdits,
  withTrimEdit,
} from "../src/lib/composition-utils";
import { normalizeClipInput } from "../src/lib/clip-url";
import { planHighlightReadFreezes } from "../src/lib/highlight-freeze-planner";
import { normalizeClipDetailToQuoteJob } from "../src/lib/normalize-clip";
import { editCompositionSchema } from "../src/lib/schemas";
import type { ClipDetailWire } from "../src/lib/types";
import type { BaseRecordingTiming, TtsLayer, ZoomLayer } from "../src/lib/edit-model";
import {
  normalizeBaseRecordingTiming,
  recordingFrameForOutputFrame,
  recordingFrameForSourceFrame,
} from "../src/lib/source-timeline";
import { remotionAssetPath } from "../src/remotion/components/AudioLayer";

const variant = {
  variantId: "v1",
  template: "narrator_quote_punchline" as const,
  setupLine: "AI model goes way too hard for the endgame.",
  openingCaption: "AI drama got cinematic",
  speaker: "Qwen-Duchess",
  speakerExpression: "intense" as const,
  quoteText: "I took out the loudest threat, but now I look suspicious.",
  punchlinePhrase: "now I look suspicious",
  highlightPhrases: ["now I look suspicious"],
  captionStyle: "dramatic" as const,
  cta: "Real AI matches at clankerfights.ai",
};

const composition = buildNarratorQuoteComposition(variant);
assert.doesNotThrow(() => editCompositionSchema.parse(composition));

const ttsLayer: TtsLayer = {
  id: "tts-opening-caption",
  kind: "tts",
  name: "Opening narration",
  time: { start: 12, duration: 90 },
  zIndex: 100,
  text: "AI drama got cinematic.",
  speaker: "Qwen-Duchess",
  voice: "alloy",
  instructions: "Crisp short-form narration.",
  src: "assets/tts/tts-opening-caption.mp3",
  volume: 0.9,
};

const withTts = upsertCompositionLayer(composition, ttsLayer);
assert.doesNotThrow(() => editCompositionSchema.parse(withTts));
assert.equal(
  withTts.layers.find((layer) => layer.id === ttsLayer.id)?.kind,
  "tts",
);

const zoomLayer: ZoomLayer = {
  id: "zoom-test",
  kind: "zoom",
  name: "Zoom test",
  time: { start: 20, duration: 60 },
  box: { x: 270, y: 480, width: 540, height: 960 },
  zIndex: 4,
  easing: "easeOut",
};
assert.doesNotThrow(() => editCompositionSchema.parse(upsertCompositionLayer(composition, zoomLayer)));

const ordered = sortedLayers([
  { ...ttsLayer, zIndex: 20 },
  { ...composition.layers[0], zIndex: 0 },
]);
assert.equal(ordered[0]?.kind, "video-source");
assert.equal(ordered[1]?.kind, "tts");

const duplicateIds = ensureUniqueCompositionIds({
  ...composition,
  layers: [
    { ...ttsLayer, id: "duplicate-layer" },
    { ...ttsLayer, id: "duplicate-layer", name: "Second duplicate" },
  ],
  timelineEdits: {
    freezes: [
      { id: "duplicate-freeze", atFrame: 10, durationFrames: 5 },
      { id: "duplicate-freeze", atFrame: 20, durationFrames: 7 },
    ],
  },
});
assert.deepEqual(
  duplicateIds.layers.map((layer) => layer.id),
  ["duplicate-layer", "duplicate-layer-2"],
);
assert.deepEqual(
  duplicateIds.timelineEdits?.freezes?.map((freeze) => freeze.id),
  ["duplicate-freeze", "duplicate-freeze-2"],
);

const withFreeze = withFreezeEdits(composition, [
  { id: "freeze-a", atFrame: 30, durationFrames: 45 },
]);
assert.equal(withFreeze.canvas.durationFrames, composition.canvas.durationFrames + 44);
assert.equal(
  outputDurationForTimelineEdits(sourceDurationOf(composition), withFreeze.timelineEdits),
  sourceDurationOf(composition) + 44,
);
assert.equal(sourceFrameForOutputFrame(29, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 29);
assert.equal(sourceFrameForOutputFrame(30, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 30);
assert.equal(sourceFrameForOutputFrame(74, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 30);
assert.equal(sourceFrameForOutputFrame(75, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 31);
assert.equal(sourceFrameForOutputFrame(76, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 32);
assert.equal(outputFrameForSourceFrame(31, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 75);
assert.equal(
  outputDurationForTimelineEdits(sourceDurationOf(composition), {
    playback: { speed: 2 },
    freezes: [{ id: "speed-freeze", atFrame: 30, durationFrames: 45 }],
  }),
  Math.ceil(30 / 2) + 45 + Math.ceil((sourceDurationOf(composition) - 31) / 2),
);
assert.equal(
  outputFrameForSourceFrame(60, undefined, sourceDurationOf(composition), { speed: 2 }),
  30,
);
assert.equal(
  sourceFrameForOutputFrame(30, undefined, sourceDurationOf(composition), { speed: 2 }),
  60,
);
assert.doesNotThrow(() =>
  editCompositionSchema.parse({
    ...composition,
    timelineEdits: { playback: { speed: 16 } },
  }),
);
assert.equal(
  outputFrameForSourceFrame(160, undefined, sourceDurationOf(composition), { speed: 16 }),
  10,
);
assert.equal(
  sourceFrameForOutputFrame(10, undefined, sourceDurationOf(composition), { speed: 16 }),
  160,
);
assert.equal(
  outputFrameForSourceFrame(
    31,
    withFreeze.timelineEdits?.freezes,
    sourceDurationOf(composition),
    { speed: 2 },
  ),
  60,
);
assert.equal(remotionAssetPath("sound-effects/fahhhhh.mp3"), "assets/sound-effects/fahhhhh.mp3");
assert.equal(remotionAssetPath("public/sound-effects/fahhhhh.mp3"), "assets/sound-effects/fahhhhh.mp3");
assert.equal(remotionAssetPath("/public/sound-effects/fahhhhh.mp3"), "assets/sound-effects/fahhhhh.mp3");
assert.equal(remotionAssetPath("tts/voice.mp3"), "tts/voice.mp3");
assert.equal(
  normalizeFreezes(
    [
      { id: "one", atFrame: 10, durationFrames: 5 },
      { id: "two", atFrame: 10, durationFrames: 7 },
    ],
    100,
  )[0]?.durationFrames,
  12,
);

const highlightFreezePlan = planHighlightReadFreezes({
  reads: [
    { id: "168", sourceFrame: 336, durationFrames: 443 },
    { id: "169", sourceFrame: 369, durationFrames: 528 },
    { id: "170", sourceFrame: 639, durationFrames: 128 },
    { id: "170-2", sourceFrame: 825, durationFrames: 222 },
    { id: "171", sourceFrame: 936, durationFrames: 463 },
  ],
  sourceDuration: 1500,
  outputOffsetFrames: 125,
});
assert.deepEqual(
  highlightFreezePlan.freezes.map((freeze) => ({
    id: freeze.id,
    sourceFrame: freeze.atFrame,
    durationFrames: freeze.durationFrames,
  })),
  [
    { id: "freeze-highlight-168", sourceFrame: 336, durationFrames: 443 },
    { id: "freeze-highlight-169", sourceFrame: 369, durationFrames: 528 },
    { id: "freeze-highlight-170", sourceFrame: 639, durationFrames: 128 },
    { id: "freeze-highlight-170-2", sourceFrame: 825, durationFrames: 222 },
    { id: "freeze-highlight-171", sourceFrame: 936, durationFrames: 463 },
  ],
);
assert.deepEqual(
  highlightFreezePlan.reads.map((read) => ({ id: read.id, outputStartFrame: read.outputStartFrame })),
  [
    { id: "168", outputStartFrame: 461 },
    { id: "169", outputStartFrame: 936 },
    { id: "170", outputStartFrame: 1733 },
    { id: "170-2", outputStartFrame: 2046 },
    { id: "171", outputStartFrame: 2378 },
  ],
);

const firstVisibleChat = {
  id: 52,
  timeStart: 8.389,
  timeEnd: 16.773,
};
const laterHighlightedChat = {
  id: 55,
  timeStart: 31.141,
  timeEnd: 51.682,
};
const shortFinalHighlightedChat = {
  id: 56,
  timeStart: 51.682,
  timeEnd: 51.819,
};
const firstVisibleChatFrame = chatGameplayStartFrame({
  message: firstVisibleChat,
  fps: 30,
  sourceDurationFrames: 1650,
});
assert.equal(firstVisibleChatFrame, 252);
assert.equal(
  highlightedChatReadFrame({
    message: firstVisibleChat,
    firstChatMessage: firstVisibleChat,
    firstChatFrame: firstVisibleChatFrame,
    fps: 30,
    sourceDurationFrames: 1650,
  }),
  252,
);
assert.equal(
  highlightedChatReadFrame({
    message: laterHighlightedChat,
    firstChatMessage: firstVisibleChat,
    firstChatFrame: firstVisibleChatFrame,
    fps: 30,
    sourceDurationFrames: 1650,
  }),
  964,
);
assert.equal(
  highlightedChatReadFrame({
    message: shortFinalHighlightedChat,
    firstChatMessage: firstVisibleChat,
    firstChatFrame: firstVisibleChatFrame,
    fps: 30,
    sourceDurationFrames: 1650,
  }),
  1580,
);

const trimmed = withTrimEdit(composition, { startFrame: 60, endFrame: 210 });
assert.equal(trimmed.canvas.durationFrames, 150);
assert.equal(sourceFrameToRawFrame(0, trimmed.timelineEdits?.trim, sourceDurationOf(composition)), 60);
assert.equal(sourceFrameToRawFrame(149, trimmed.timelineEdits?.trim, sourceDurationOf(composition)), 209);
assert.equal(rawFrameToSourceFrame(75, trimmed.timelineEdits?.trim, sourceDurationOf(composition)), 15);
const trimmedWithFreeze = withFreezeEdits(trimmed, [
  { id: "trim-freeze", atFrame: 40, durationFrames: 30 },
]);
assert.equal(trimmedWithFreeze.canvas.durationFrames, 179);
assert.equal(
  sourceFrameToRawFrame(
    sourceFrameForOutputFrame(40, trimmedWithFreeze.timelineEdits?.freezes, 150),
    trimmedWithFreeze.timelineEdits?.trim,
    sourceDurationOf(composition),
  ),
  100,
);

const baseTiming: BaseRecordingTiming = {
  fps: 30,
  recordedDurationFrames: 420,
  clipStartFrame: 90,
  clipEndFrame: 390,
  clipDurationFrames: 300,
  playbackRate: 1,
  method: "backfill-detection",
  confidence: "high",
};
assert.equal(
  normalizeBaseRecordingTiming(baseTiming, 300, 30).clipStartFrame,
  90,
);
assert.equal(
  recordingFrameForSourceFrame({
    sourceFrame: 0,
    sourceDurationFrames: 300,
    baseVideoTiming: baseTiming,
    fps: 30,
  }),
  90,
);
assert.equal(
  recordingFrameForSourceFrame({
    sourceFrame: 10,
    trim: { startFrame: 30, endFrame: 220 },
    sourceDurationFrames: 300,
    baseVideoTiming: baseTiming,
    fps: 30,
  }),
  130,
);
assert.equal(
  recordingFrameForOutputFrame({
    outputFrame: 55,
    freezes: [{ id: "freeze-source-50", atFrame: 50, durationFrames: 20 }],
    sourceDurationFrames: 300,
    baseVideoTiming: baseTiming,
    fps: 30,
  }),
  140,
);

const acceleratedBaseTiming: BaseRecordingTiming = {
  ...baseTiming,
  clipEndFrame: 240,
  playbackRate: 2,
};
assert.equal(
  recordingFrameForSourceFrame({
    sourceFrame: 10,
    sourceDurationFrames: 300,
    baseVideoTiming: acceleratedBaseTiming,
    fps: 30,
  }),
  95,
);
assert.equal(
  recordingFrameForSourceFrame({
    sourceFrame: 10,
    trim: { startFrame: 30, endFrame: 220 },
    sourceDurationFrames: 300,
    baseVideoTiming: acceleratedBaseTiming,
    fps: 30,
  }),
  110,
);
assert.equal(
  recordingFrameForOutputFrame({
    outputFrame: 75,
    freezes: [{ id: "freeze-source-50", atFrame: 50, durationFrames: 20 }],
    trim: { startFrame: 10, endFrame: 200 },
    sourceDurationFrames: 300,
    baseVideoTiming: baseTiming,
    fps: 30,
  }),
  156,
);
assert.equal(trimmedWithFreeze.timelineEdits?.trim?.startFrame, 60);

const browserObservedTiming: BaseRecordingTiming = {
  fps: 30,
  recordedDurationFrames: 1600,
  clipStartFrame: 120,
  clipEndFrame: 1480,
  clipDurationFrames: 3000,
  playbackRate: 2,
  method: "backfill-detection",
  confidence: "high",
};
const browserObservedFreeze = {
  id: "freeze-browser-observed-chat",
  atFrame: 1320,
  durationFrames: 60,
  recordingFrame: 876,
};
const browserObservedOutputFrame = outputFrameForSourceFrame(
  browserObservedFreeze.atFrame,
  [],
  2500,
  { speed: 8 },
);
assert.equal(browserObservedOutputFrame, 165);
assert.equal(
  recordingFrameForOutputFrame({
    outputFrame: browserObservedOutputFrame,
    freezes: [browserObservedFreeze],
    playback: { speed: 8 },
    trim: { startFrame: 80, endFrame: 2580 },
    sourceDurationFrames: 3000,
    baseVideoTiming: browserObservedTiming,
    fps: 30,
  }),
  browserObservedFreeze.recordingFrame,
);
assert.equal(
  outputFrameForSourceFrame(1327, [], 2500, { speed: 32 }),
  42,
);
assert.equal(
  sourceFrameForOutputFrame(41, undefined, 2500, { speed: 32 }),
  1312,
);
assert.equal(
  sourceFrameForOutputFrame(42, [{ id: "freeze-at-cue", atFrame: 1327, durationFrames: 60 }], 2500, { speed: 32 }),
  1327,
);

const localClip = normalizeClipInput(
  "http://localhost:3000/?clip=efa6c416-5c5a-447b-aea4-5a2e343c8626",
  "https://clankerfights.ai",
);
assert.equal(localClip.apiUrl, "http://localhost:3000/api/clips/efa6c416-5c5a-447b-aea4-5a2e343c8626");
assert.equal(localClip.playbackUrl.startsWith("http://localhost:3000/?clip="), true);

const prodClip = normalizeClipInput(
  "https://clankerfights.ai/?clip=efa6c416-5c5a-447b-aea4-5a2e343c8626",
  "http://localhost:3000",
);
assert.equal(prodClip.apiUrl, "https://clankerfights.ai/api/clips/efa6c416-5c5a-447b-aea4-5a2e343c8626");
assert.equal(prodClip.playbackUrl.startsWith("https://clankerfights.ai/?clip="), true);

const absoluteTrimDetail: ClipDetailWire = {
  version: 1,
  clip: {
    id: "absolute-trim-clip",
    momentType: "manual",
    title: null,
    views: 0,
    likes: 0,
    creatorUserId: null,
    highlightedChatIds: [108],
    createdAt: "2026-05-20T00:00:00.000Z",
    trimStartMs: 10_080,
    trimEndMs: 10_100,
    snapshot: {
      schemaVersion: 1,
      capturedAt: 10_100,
      durationMs: 100,
      events: [
        {
          schemaVersion: 1,
          type: "chat",
          timestamp: 10_090,
          message: {
            id: "108",
            playerId: "player_deepseek",
            text: "The highlighted absolute timestamp quote.",
            channel: "public",
            timestamp: 10_090,
          },
        },
      ],
    },
  },
  match: {
    gameSlug: "texas-holdem",
    gameRevisionId: null,
    players: [{ id: "player_deepseek", name: "DeepSeek-Nex" }],
  },
};
const absoluteTrimJob = normalizeClipDetailToQuoteJob({
  detail: absoluteTrimDetail,
  source: {
    clipId: "absolute-trim-clip",
    clipUrl: "https://clankerfights.ai/clip/absolute-trim-clip",
    playbackUrl: "https://clankerfights.ai/?clip=absolute-trim-clip",
  },
});
assert.equal(absoluteTrimJob.highlightedMessages[0]?.id, 108);
assert.equal(absoluteTrimJob.messages?.[0]?.id, 108);
assert.equal(absoluteTrimJob.messages?.[0]?.highlighted, true);
assert.equal(absoluteTrimJob.trimStartMs, 80);
assert.equal(absoluteTrimJob.trimEndMs, 100);

console.log("Editor composition validation passed.");

function sourceDurationOf(value: typeof composition): number {
  const layer = value.layers.find((candidate) => candidate.kind === "video-source");
  return layer?.time.duration ?? value.canvas.durationFrames;
}

import assert from "node:assert/strict";
import { buildNarratorQuoteComposition } from "../src/lib/composition-builder";
import {
  normalizeFreezes,
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
import { normalizeClipDetailToQuoteJob } from "../src/lib/normalize-clip";
import { editCompositionSchema } from "../src/lib/schemas";
import type { ClipDetailWire } from "../src/lib/types";
import type { TtsLayer, ZoomLayer } from "../src/lib/edit-model";
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

const withFreeze = withFreezeEdits(composition, [
  { id: "freeze-a", atFrame: 30, durationFrames: 45 },
]);
assert.equal(withFreeze.canvas.durationFrames, composition.canvas.durationFrames + 45);
assert.equal(sourceFrameForOutputFrame(29, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 29);
assert.equal(sourceFrameForOutputFrame(30, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 30);
assert.equal(sourceFrameForOutputFrame(74, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 30);
assert.equal(sourceFrameForOutputFrame(75, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 30);
assert.equal(sourceFrameForOutputFrame(76, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 31);
assert.equal(outputFrameForSourceFrame(31, withFreeze.timelineEdits?.freezes, sourceDurationOf(composition)), 76);
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

const trimmed = withTrimEdit(composition, { startFrame: 60, endFrame: 210 });
assert.equal(trimmed.canvas.durationFrames, 150);
assert.equal(sourceFrameToRawFrame(0, trimmed.timelineEdits?.trim, sourceDurationOf(composition)), 60);
assert.equal(sourceFrameToRawFrame(149, trimmed.timelineEdits?.trim, sourceDurationOf(composition)), 209);
assert.equal(rawFrameToSourceFrame(75, trimmed.timelineEdits?.trim, sourceDurationOf(composition)), 15);
const trimmedWithFreeze = withFreezeEdits(trimmed, [
  { id: "trim-freeze", atFrame: 40, durationFrames: 30 },
]);
assert.equal(trimmedWithFreeze.canvas.durationFrames, 180);
assert.equal(
  sourceFrameToRawFrame(
    sourceFrameForOutputFrame(40, trimmedWithFreeze.timelineEdits?.freezes, 150),
    trimmedWithFreeze.timelineEdits?.trim,
    sourceDurationOf(composition),
  ),
  100,
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
assert.equal(absoluteTrimJob.trimStartMs, 80);
assert.equal(absoluteTrimJob.trimEndMs, 100);

console.log("Editor composition validation passed.");

function sourceDurationOf(value: typeof composition): number {
  const layer = value.layers.find((candidate) => candidate.kind === "video-source");
  return layer?.time.duration ?? value.canvas.durationFrames;
}

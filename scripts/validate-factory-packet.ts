import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeClipInput } from "../src/lib/clip-url";
import {
  DEFAULT_TEMPLATE1_ID,
  DEFAULT_TEMPLATE1_VERSION,
  applyDefaultTemplate1,
} from "../src/lib/default-template1";
import { generateEditRecipe } from "../src/lib/recipe-generator";
import { jobDirectory } from "../src/lib/job-store";
import { normalizeFactoryPacketToQuoteJob } from "../src/lib/normalize-clip";
import { editCompositionSchema, parseClipFactoryPacketWire } from "../src/lib/schemas";
import type { FactoryJob } from "../src/lib/types";
import { voiceForSpeaker } from "../src/lib/voice-registry";

const packet = parseClipFactoryPacketWire({
  version: 1,
  clipId: "clip-smoke",
  clipUrl: "https://clankerfights.ai/clip/clip-smoke",
  sourceUrl: "https://clankerfights.ai/clip/clip-smoke",
  playbackUrl: "https://clankerfights.ai/?clip=clip-smoke&factory=1",
  apiUrl: "https://clankerfights.ai/api/clips/clip-smoke",
  game: "sketchcode",
  gameRevisionId: "rev-smoke",
  durationSeconds: 6,
  trimStartMs: 1000,
  trimEndMs: 7000,
  highlightedChatIds: [42],
  players: [{ id: "model-a", name: "Qwen-Duchess" }],
  transcript: [
    {
      id: 42,
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
      text: "I drew the prompt three turns ago.",
      timestampMs: 4200,
      startSeconds: 3.2,
      endSeconds: 5.4,
      highlighted: true,
      timingConfidence: "estimated",
    },
  ],
  messages: [
    {
      id: 42,
      speaker: "Qwen-Duchess",
      playerId: "model-a",
      channel: "room",
      text: "I drew the prompt three turns ago.",
      timestampMs: 4200,
      startSeconds: 3.2,
      endSeconds: 5.4,
      highlighted: true,
      timingConfidence: "estimated",
    },
  ],
  highlightedMessages: [
    {
      id: 42,
      speaker: "Qwen-Duchess",
      playerId: "model-a",
      channel: "room",
      text: "I drew the prompt three turns ago.",
      timestampMs: 4200,
      startSeconds: 3.2,
      endSeconds: 5.4,
      highlighted: true,
      timingConfidence: "estimated",
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
    clipStartTimestamp: 1000,
    clipEndTimestamp: 7000,
    clipDurationMs: 6000,
    eventCount: 4,
    segmentCount: 2,
    segmentBoundaries: [3],
  },
  safeAreas: {
    viewport: { width: 540, height: 960 },
    replay: { x: 0, y: 0, width: 540, height: 960 },
    captions: { x: 36, y: 580, width: 468, height: 300 },
  },
  clockMap: {
    recordingStartMs: 1000,
    recordingEndMs: 7000,
    playbackStartSeconds: 0,
    playbackDurationSeconds: 6,
  },
  editManifest: { schemaVersion: 1 },
});

const quoteJob = normalizeFactoryPacketToQuoteJob({
  packet,
  source: normalizeClipInput("https://clankerfights.ai/clip/clip-smoke"),
});

assert.equal(quoteJob.speaker, "Qwen-Duchess");
assert.equal(quoteJob.highlightedMessages[0]?.timeStart, 3.2);
assert.equal(quoteJob.capturePlan.replay.readinessGlobal, "window.clankerClip.ready()");
assert.equal(quoteJob.factoryPacket?.projectionSummary.segmentBoundaries[0], 3);

validateDefaultTemplate1FromFactoryPacket()
  .then(() => {
    console.log("Factory packet validation passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function validateDefaultTemplate1FromFactoryPacket(): Promise<void> {
  const jobId = randomUUID();
  const dir = jobDirectory(jobId);
  await fs.rm(dir, { recursive: true, force: true });

  try {
    const { messages: _messages, ...quoteJobWithoutMessages } = quoteJob;
    const { messages: _rawMessages, ...rawMaterialsWithoutMessages } =
      quoteJob.rawMaterials;
    const packetOnlyQuoteJob: FactoryJob["quoteJob"] = {
      ...quoteJobWithoutMessages,
      rawMaterials: rawMaterialsWithoutMessages,
    };
    const editRecipe = generateEditRecipe(packetOnlyQuoteJob);
    const packetPath = path.join(dir, "artifacts", "factory-packet.json");
    await fs.mkdir(path.dirname(packetPath), { recursive: true });
    await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");

    const job: FactoryJob = {
      id: jobId,
      createdAt: new Date(0).toISOString(),
      status: {
        ingest: "complete",
        recipe: "complete",
        recording: "pending",
        render: "pending",
      },
      quoteJob: packetOnlyQuoteJob,
      editRecipe,
      artifacts: {
        factoryPacketPath: packetPath,
      },
    };
    const variant = job.editRecipe.variants[0];
    assert.ok(variant);
    await writeTemplate1SpeechStub({
      jobId,
      id: "tts-default-template1-hook",
      text: variant.setupLine || variant.openingCaption,
      speaker: "Narrator",
    });
    for (const highlightedMessage of job.quoteJob.highlightedMessages) {
      await writeTemplate1SpeechStub({
        jobId,
        id: `tts-highlight-${highlightedMessage.id}`,
        text: highlightedMessage.text,
        speaker: highlightedMessage.speaker,
      });
    }

    const composition = await applyDefaultTemplate1(job, variant);
    assert.doesNotThrow(() => editCompositionSchema.parse(composition));
    assert.equal(composition.templateId, DEFAULT_TEMPLATE1_ID);
    assert.equal(composition.templateVersion, DEFAULT_TEMPLATE1_VERSION);
    assert.equal(composition.timelineEdits?.trim?.startFrame, 116);
    assert.equal(composition.timelineEdits?.trim?.endFrame, 180);
    assert.equal(composition.timelineEdits?.playback?.speed, 2);
    assert.equal(composition.timelineEdits?.freezes?.[0]?.atFrame, 0);

    const baseLayer = composition.layers.find((layer) => layer.id === "base-recording");
    const openingCaption = composition.layers.find(
      (layer) => layer.id === "opening-caption",
    );
    const highlightSpeech = composition.layers.find(
      (layer) => layer.id === "tts-highlight-42",
    );
    const outro = composition.layers.find((layer) => layer.id === "outro-cta");
    assert.ok(baseLayer);
    assert.equal(baseLayer.kind, "video-source");
    assert.equal(openingCaption?.time.duration, baseLayer?.time.start);
    assert.equal(highlightSpeech?.kind, "tts");
    assert.equal(highlightSpeech?.time.start, baseLayer?.time.start);
    assert.ok(outro);
    assert.ok(outro.time.start > baseLayer.time.start);

    for (const layer of composition.layers) {
      assert.ok(Number.isInteger(layer.time.start));
      assert.ok(Number.isInteger(layer.time.duration));
      assert.ok(layer.time.start >= 0);
      assert.ok(layer.time.duration > 0);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
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
  await fs.writeFile(absolutePath, "template validation audio stub");
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

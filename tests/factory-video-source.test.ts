import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  internalAutomatedClipRequestSchema,
  factoryVideoCreateRequestSchema,
} from "../src/lib/schemas";
import {
  createFactoryJobForVideo,
  resolveFactoryVideoClipSource,
  runFactoryWorkflow,
} from "../src/lib/factory-pipeline";
import { DEFAULT_CLIP_PLAYBACK_SPEED } from "../src/lib/factory-defaults";
import { createFactoryJob, readFactoryJob } from "../src/lib/job-store";
import { normalizeFactoryPacketToQuoteJob } from "../src/lib/normalize-clip";
import { generateEditRecipe } from "../src/lib/recipe-generator";
import type {
  ClipFactoryPacketWire,
  InternalAutomatedClipRequest,
  InternalAutomatedClipResult,
} from "../src/lib/types";

test("factory video requests accept a bare clip id with default workflow", async () => {
  const request = factoryVideoCreateRequestSchema.parse({
    clipId: "clip-abc123",
    hookText: "The table got weird",
  });

  assert.deepEqual(request.workflow, {
    record: true,
    renderRaw: false,
    renderVariants: ["v1"],
    overwrite: false,
  });

  const source = await resolveFactoryVideoClipSource(request);
  assert.equal(source.clipUrlOrId, "clip-abc123");
  assert.deepEqual(source.snapshot, {
    kind: "clip",
    clipId: "clip-abc123",
  });
});

test("factory video requests preserve manual clip URL sources", async () => {
  const request = factoryVideoCreateRequestSchema.parse({
    source: {
      kind: "clip",
      clipUrl: "https://clankerfights.test/clip/manual-clip-1",
    },
    hookText: "Human picked this one",
  });

  const source = await resolveFactoryVideoClipSource(request);

  assert.equal(source.clipUrlOrId, "https://clankerfights.test/clip/manual-clip-1");
  assert.deepEqual(source.snapshot, {
    kind: "clip",
    clipUrl: "https://clankerfights.test/clip/manual-clip-1",
  });
});

test("factory video requests preserve autoclipped edited clip sources", async () => {
  const request = factoryVideoCreateRequestSchema.parse({
    source: {
      kind: "clip",
      clipUrl: "https://clankerfights.test/clip/autoclip-1",
      autoclipped: true,
      autoclip: {
        runId: "live-e2e-123",
        title: "Ring-Ding regrets the bluff",
        candidateKey: "texas-holdem:abc",
      },
    },
    hookText: "Human approved this autoclip",
  });

  const source = await resolveFactoryVideoClipSource(request);

  assert.equal(source.clipUrlOrId, "https://clankerfights.test/clip/autoclip-1");
  assert.deepEqual(source.snapshot, {
    kind: "clip",
    clipUrl: "https://clankerfights.test/clip/autoclip-1",
    autoclipped: true,
    autoclip: {
      runId: "live-e2e-123",
      title: "Ring-Ding regrets the bluff",
      candidateKey: "texas-holdem:abc",
    },
  });
});

test("factory video jobs default gameplay speed to 8x", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(minimalFactoryPacket("default-speed-clip")), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const request = factoryVideoCreateRequestSchema.parse({
      clipId: "default-speed-clip",
      hookText: "The table got weird",
    });

    const job = await createFactoryJobForVideo(request);

    assert.equal(job.quoteJob.clipPlaybackSpeed, DEFAULT_CLIP_PLAYBACK_SPEED);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("factory video requests reject ambiguous or missing sources", () => {
  assert.throws(
    () => factoryVideoCreateRequestSchema.parse({ hookText: "no source" }),
    /Provide exactly one clipUrl, clipId, or source/,
  );
  assert.throws(
    () =>
      factoryVideoCreateRequestSchema.parse({
        clipId: "clip-1",
        source: { kind: "clip", clipUrl: "https://clankerfights.test/clip/clip-1" },
      }),
    /Provide exactly one clipUrl, clipId, or source/,
  );
});

test("watch archive selections create a Clankerfights clip before rendering", async () => {
  const request = factoryVideoCreateRequestSchema.parse({
    source: {
      kind: "watchArchiveSelection",
      createClipRequest: {
        matchId: "match-1",
        startMs: 10_000,
        endMs: 22_000,
        highlightedChatIds: [7, 8],
        title: "Two agents invent a rivalry",
        momentScore: 0.93,
        momentType: "funny",
      },
    },
    hookText: "AI invented table drama",
    workflow: {
      record: false,
      renderRaw: false,
      renderVariants: [],
      overwrite: false,
    },
  });

  let seenRequest: InternalAutomatedClipRequest | undefined;
  const createAutomatedClip = async (
    selection: InternalAutomatedClipRequest,
  ): Promise<InternalAutomatedClipResult> => {
    seenRequest = selection;
    return {
      version: 1,
      clipId: "clip-from-selection",
      url: "https://clankerfights.test/clip/clip-from-selection",
      matchId: selection.matchId,
    };
  };

  const source = await resolveFactoryVideoClipSource(request, {
    createAutomatedClip,
  });
  const createClipRequest = selectedCreateClipRequest(request);

  assert.deepEqual(seenRequest, createClipRequest);
  assert.equal(
    source.clipUrlOrId,
    "https://clankerfights.test/clip/clip-from-selection",
  );
  assert.deepEqual(source.snapshot, {
    kind: "watchArchiveSelection",
    createClipRequest,
    automatedClip: {
      version: 1,
      clipId: "clip-from-selection",
      url: "https://clankerfights.test/clip/clip-from-selection",
      matchId: "match-1",
    },
  });
});

test("watch archive API workflows save an editable default-template composition", async () => {
  const previousRequireTts = process.env.SHORT_FACTORY_REQUIRE_TTS;
  delete process.env.SHORT_FACTORY_REQUIRE_TTS;
  try {
    const packet = minimalFactoryPacket("editable-automated-clip");
    const quoteJob = normalizeFactoryPacketToQuoteJob({
      packet,
      source: {
        clipId: packet.clipId,
        clipUrl: packet.clipUrl,
        playbackUrl: packet.playbackUrl,
      },
      hookText: "Ring-Ding immediately regrets the all in",
      clipPlaybackSpeed: DEFAULT_CLIP_PLAYBACK_SPEED,
    });
    const quoteJobWithSource = {
      ...quoteJob,
      source: {
        kind: "watchArchiveSelection" as const,
        createClipRequest: {
          matchId: "match-1",
          startMs: 10_000,
          endMs: 22_000,
          highlightedChatIds: [7],
        },
        automatedClip: {
          version: 1,
          clipId: packet.clipId,
          url: `?clip=${packet.clipId}`,
          matchId: "match-1",
        },
      },
    };
    const job = await createFactoryJob({
      quoteJob: quoteJobWithSource,
      editRecipe: generateEditRecipe(quoteJobWithSource),
    });

    const finished = await runFactoryWorkflow(job, {
      record: false,
      renderRaw: false,
      renderVariants: [],
      overwrite: false,
    });

    const savedComposition = finished.editRecipe.variants[0]?.composition;
    assert.equal(savedComposition?.templateId, "default");
    assert.equal(
      savedComposition?.timelineEdits?.playback?.speed,
      DEFAULT_CLIP_PLAYBACK_SPEED,
    );

    const persisted = await readFactoryJob(job.id);
    assert.equal(persisted.editRecipe.variants[0]?.composition?.templateId, "default");
  } finally {
    if (previousRequireTts === undefined) {
      delete process.env.SHORT_FACTORY_REQUIRE_TTS;
    } else {
      process.env.SHORT_FACTORY_REQUIRE_TTS = previousRequireTts;
    }
  }
});

test("watch archive selections resolve relative Clankerfights clip URLs", async () => {
  const previousBaseUrl = process.env.CLANKERFIGHTS_BASE_URL;
  process.env.CLANKERFIGHTS_BASE_URL = "https://clankerfights.test";
  try {
    const request = factoryVideoCreateRequestSchema.parse({
      source: {
        kind: "watchArchiveSelection",
        createClipRequest: {
          matchId: "match-1",
          startMs: 10_000,
          endMs: 22_000,
          highlightedChatIds: [7],
        },
      },
    });

    const source = await resolveFactoryVideoClipSource(request, {
      createAutomatedClip: async (selection) => ({
        version: 1,
        clipId: "clip-from-selection",
        url: `?clip=clip-from-selection`,
        matchId: selection.matchId,
      }),
    });

    assert.equal(
      source.clipUrlOrId,
      "https://clankerfights.test/?clip=clip-from-selection",
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLANKERFIGHTS_BASE_URL;
    } else {
      process.env.CLANKERFIGHTS_BASE_URL = previousBaseUrl;
    }
  }
});

test("factory video workflow accepts explicit recording durations up to 5 minutes", () => {
  const request = factoryVideoCreateRequestSchema.parse({
    clipId: "clip-1",
    workflow: {
      record: true,
      renderRaw: false,
      renderVariants: ["v1"],
      durationSeconds: 300,
      overwrite: false,
    },
  });

  assert.equal(request.workflow.durationSeconds, 300);
  assert.throws(
    () =>
      factoryVideoCreateRequestSchema.parse({
        clipId: "clip-1",
        workflow: {
          record: true,
          renderRaw: false,
          renderVariants: ["v1"],
          durationSeconds: 301,
          overwrite: false,
        },
      }),
    /Too big/,
  );
});

test("watch archive selections require a positive time window", () => {
  assert.throws(
    () =>
      internalAutomatedClipRequestSchema.parse({
        matchId: "match-1",
        startMs: 22_000,
        endMs: 10_000,
      }),
    /endMs must be greater than startMs/,
  );
});

test("watch archive selections are capped at 5 minutes", () => {
  assert.throws(
    () =>
      internalAutomatedClipRequestSchema.parse({
        matchId: "match-1",
        startMs: 10_000,
        endMs: 310_001,
      }),
    /at most 5 minutes/,
  );
});

function selectedCreateClipRequest(request: {
  source?: { kind: string; createClipRequest?: InternalAutomatedClipRequest };
}): InternalAutomatedClipRequest {
  if (request.source?.kind !== "watchArchiveSelection" || !request.source.createClipRequest) {
    throw new Error("Expected a watch archive selection source.");
  }
  return request.source.createClipRequest;
}

function minimalFactoryPacket(clipId: string): ClipFactoryPacketWire {
  const startedAt = 1_780_000_000_000;
  const message = {
    id: 7,
    speaker: "Qwen-Kyle",
    playerId: "player-1",
    channel: "room",
    text: "No way this all in works.",
    timestampMs: startedAt + 1_000,
    startSeconds: 1,
    endSeconds: 2,
    highlighted: true,
    timingConfidence: "exact" as const,
  };
  return {
    version: 1,
    clipId,
    clipUrl: `https://clankerfights.test/clip/${clipId}`,
    sourceUrl: `https://clankerfights.test/clip/${clipId}`,
    playbackUrl: `https://clankerfights.test/?clip=${clipId}&factory=1`,
    apiUrl: `https://clankerfights.test/api/clips/${clipId}`,
    game: "texas-holdem",
    gameRevisionId: null,
    durationSeconds: 10,
    trimStartMs: null,
    trimEndMs: null,
    highlightedChatIds: [message.id],
    players: [{ id: "player-1", name: "Qwen-Kyle" }],
    transcript: [message],
    messages: [message],
    highlightedMessages: [message],
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
      perspective: { kind: "spectator" },
      clipStartTimestamp: startedAt,
      clipEndTimestamp: startedAt + 10_000,
      clipDurationMs: 10_000,
      eventCount: 1,
      segmentCount: 1,
      segmentBoundaries: [0, 10_000],
    },
    safeAreas: {
      viewport: { width: 540, height: 960 },
      replay: { x: 0, y: 0, width: 540, height: 576 },
      captions: { x: 0, y: 576, width: 540, height: 384 },
    },
    clockMap: {
      recordingStartMs: startedAt,
      recordingEndMs: startedAt + 10_000,
      playbackStartSeconds: 0,
      playbackDurationSeconds: 10,
    },
    editManifest: {},
  };
}

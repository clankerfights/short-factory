import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  internalAutomatedClipRequestSchema,
  factoryVideoCreateRequestSchema,
} from "../src/lib/schemas";
import { resolveFactoryVideoClipSource } from "../src/lib/factory-pipeline";
import type {
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

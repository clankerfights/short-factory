import type {
  ClipDetailWire,
  ClipPlayerWire,
  ClipSnapshot,
  ClipSnapshotEvent,
  HighlightedMessage,
  QuoteJob,
} from "./types";
import { createPhoneReplayCapturePlan } from "./capture-plan";
import type { ClipRawMaterials } from "./edit-model";

type SourceUrls = {
  clipId: string;
  clipUrl: string;
  playbackUrl: string;
};

export function normalizeClipDetailToQuoteJob(args: {
  detail: ClipDetailWire;
  source: SourceUrls;
  toneHint?: string;
}): QuoteJob {
  const { detail, source, toneHint } = args;
  const snapshot = detail.clip.snapshot;
  assertUsableSnapshot(snapshot);

  const trimWindow = resolveTrimWindow({
    snapshot,
    trimStartMs: detail.clip.trimStartMs,
    trimEndMs: detail.clip.trimEndMs,
  });
  const { trimStartMs, trimEndMs, windowStartTimestamp, windowEndTimestamp } =
    trimWindow;

  const messages = extractReplayChat(snapshot.events, {
    windowStartTimestamp,
    windowEndTimestamp,
  });
  const highlightedIds = new Set(detail.clip.highlightedChatIds.map(Number));
  const highlightedMessages = messages
    .filter((message) => highlightedIds.has(message.id))
    .map((message) =>
      toHighlightedMessage({
        message,
        snapshot,
        players: detail.match.players,
        windowStartTimestamp,
        clipEndSeconds: Math.max(1, (windowEndTimestamp - windowStartTimestamp) / 1000),
      }),
    );

  if (highlightedMessages.length === 0) {
    throw new Error(
      "This clip has no highlighted chat messages in the replay window. Highlight a quote in Clankerfights first.",
    );
  }

  const speaker = mostCommon(highlightedMessages.map((message) => message.speaker));
  const durationSeconds = Math.max(1, Math.round((trimEndMs - trimStartMs) / 1000));
  const capturePlan = createPhoneReplayCapturePlan();
  const rawMaterials = createClipRawMaterials({
    source,
    game: detail.match.gameSlug,
    trimStartMs,
    trimEndMs,
    durationSeconds,
    highlightedChatIds: detail.clip.highlightedChatIds,
    highlightedMessages,
    players: detail.match.players,
    capturePlan,
  });

  return {
    clipId: source.clipId,
    clipUrl: source.clipUrl,
    playbackUrl: source.playbackUrl,
    game: detail.match.gameSlug,
    speaker,
    ...(toneHint ? { toneHint } : {}),
    trimStartMs,
    trimEndMs,
    durationSeconds,
    highlightedChatIds: detail.clip.highlightedChatIds,
    highlightedMessages,
    players: detail.match.players,
    rawMaterials,
    capturePlan,
  };
}

function createClipRawMaterials(args: {
  source: SourceUrls;
  game: string;
  trimStartMs: number;
  trimEndMs: number;
  durationSeconds: number;
  highlightedChatIds: number[];
  highlightedMessages: HighlightedMessage[];
  players: ClipPlayerWire[];
  capturePlan: ClipRawMaterials["capturePlan"];
}): ClipRawMaterials {
  return {
    clipId: args.source.clipId,
    sourceUrl: args.source.clipUrl,
    playbackUrl: args.source.playbackUrl,
    game: args.game,
    trimWindowMs: {
      start: args.trimStartMs,
      end: args.trimEndMs,
    },
    durationSeconds: args.durationSeconds,
    highlightedChatIds: args.highlightedChatIds,
    highlightedMessages: args.highlightedMessages,
    players: args.players,
    capturePlan: args.capturePlan,
    recommendedFactoryMode: {
      queryParam: "factory",
      capabilities: [
        "portrait-safe layout sizing",
        "ready signal after replay and chat load",
        "configurable chat panel height",
        "optional playback chrome hiding",
        "highlighted chat metadata export",
      ],
    },
  };
}

function assertUsableSnapshot(snapshot: ClipSnapshot): asserts snapshot is ClipSnapshot {
  if (!snapshot || !Array.isArray(snapshot.events)) {
    throw new Error("Clip detail did not include a replay snapshot with events.");
  }
}

function resolveTrimWindow(args: {
  snapshot: ClipSnapshot;
  trimStartMs: number | null;
  trimEndMs: number | null;
}) {
  const snapshotStartTimestamp = args.snapshot.capturedAt - args.snapshot.durationMs;
  const rawStart = args.trimStartMs ?? 0;
  const rawEnd = args.trimEndMs ?? args.snapshot.durationMs;
  const trimsAreAbsolute =
    rawStart >= snapshotStartTimestamp && rawEnd <= args.snapshot.capturedAt;

  if (trimsAreAbsolute) {
    return {
      trimStartMs: rawStart - snapshotStartTimestamp,
      trimEndMs: rawEnd - snapshotStartTimestamp,
      windowStartTimestamp: rawStart,
      windowEndTimestamp: rawEnd,
    };
  }

  return {
    trimStartMs: rawStart,
    trimEndMs: rawEnd,
    windowStartTimestamp: snapshotStartTimestamp + rawStart,
    windowEndTimestamp: snapshotStartTimestamp + rawEnd,
  };
}

function extractReplayChat(
  events: ClipSnapshotEvent[],
  window: { windowStartTimestamp: number; windowEndTimestamp: number },
) {
  return events.flatMap((event) => {
    if (!isChatEvent(event)) return [];
    const id = Number(event.message.id);
    if (!Number.isInteger(id)) return [];

    const timestamp = event.message.timestamp ?? event.timestamp;
    if (
      timestamp < window.windowStartTimestamp ||
      timestamp > window.windowEndTimestamp
    ) {
      return [];
    }

    return [
      {
        id,
        playerId: event.message.playerId,
        text: event.message.text,
        channel: event.message.channel,
        timestamp,
        fromSpectator: event.message.fromSpectator,
      },
    ];
  });
}

function toHighlightedMessage(args: {
  message: ReturnType<typeof extractReplayChat>[number];
  snapshot: ClipSnapshot;
  players: { id: string; name: string }[];
  windowStartTimestamp: number;
  clipEndSeconds: number;
}): HighlightedMessage {
  const { message, snapshot, players, windowStartTimestamp, clipEndSeconds } = args;
  const timeStart = roundToTenth((message.timestamp - windowStartTimestamp) / 1000);
  const estimatedReadSeconds = Math.max(1.6, Math.min(7, message.text.length / 18));

  return {
    id: message.id,
    speaker: resolveSpeakerName(message.playerId, snapshot, players),
    playerId: message.playerId,
    channel: message.channel,
    text: message.text,
    timeStart,
    timeEnd: roundToTenth(Math.min(clipEndSeconds, timeStart + estimatedReadSeconds)),
    timestamp: message.timestamp,
  };
}

function resolveSpeakerName(
  playerId: string,
  snapshot: ClipSnapshot,
  players: { id: string; name: string }[],
): string {
  return (
    players.find((player) => player.id === playerId)?.name ??
    snapshot.playerDirectory?.[playerId]?.name ??
    "Unknown model"
  );
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? values[0];
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function isChatEvent(
  event: ClipSnapshotEvent,
): event is Extract<ClipSnapshotEvent, { type: "chat" }> {
  return event.type === "chat" && "message" in event;
}

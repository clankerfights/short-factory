import type {
  ClipDetailWire,
  ClipPlayerWire,
  ClipChatMessage,
  ClipSnapshot,
  ClipSnapshotEvent,
  ClipFactoryPacketWire,
  HighlightedMessage,
  QuoteJob,
} from "./types";
import { createPhoneReplayCapturePlan } from "./capture-plan";
import type { ClipRawMaterials } from "./edit-model";

type SourceUrls = {
  clipId: string;
  clipUrl: string;
  playbackUrl: string;
  factoryPacketUrl?: string;
  captureUrl?: string;
};

export function normalizeFactoryPacketToQuoteJob(args: {
  packet: ClipFactoryPacketWire;
  source: SourceUrls;
  hookText?: string;
  toneHint?: string;
  finalMessageTone?: string;
  finalMessageVoiceInstructions?: string;
  selectedTemplateId?: string;
  clipPlaybackSpeed?: number;
}): QuoteJob {
  const {
    packet,
    source,
    hookText,
    toneHint,
    finalMessageTone,
    finalMessageVoiceInstructions,
    selectedTemplateId,
    clipPlaybackSpeed,
  } = args;
  const messages = packet.messages.map((message) =>
    packetMessageToClipChatMessage(packet, message),
  );
  const highlightedMessages = packet.highlightedMessages.map((message) =>
    packetMessageToHighlightedMessage(packet, message),
  );

  if (highlightedMessages.length === 0) {
    throw new Error(
      "This clip has no highlighted chat messages in the factory packet. Highlight a quote in Clankerfights first.",
    );
  }

  const speaker = mostCommon(highlightedMessages.map((message) => message.speaker));
  const durationSeconds = Math.max(1, Math.round(packet.durationSeconds));
  const trimStartMs = 0;
  const trimEndMs = Math.round(packet.durationSeconds * 1000);
  const capturePlan = capturePlanFromFactoryPacket(packet);
  const rawMaterials = createClipRawMaterials({
    source: {
      ...source,
      playbackUrl: packet.playbackUrl,
      clipUrl: packet.clipUrl,
    },
    game: packet.game,
    trimStartMs,
    trimEndMs,
    durationSeconds,
    messages,
    highlightedChatIds: packet.highlightedChatIds,
    highlightedMessages,
    players: packet.players,
    capturePlan,
    factoryPacket: packet,
  });

  return {
    clipId: packet.clipId,
    clipUrl: packet.clipUrl,
    playbackUrl: packet.playbackUrl,
    game: packet.game,
    speaker,
    ...(hookText ? { hookText } : {}),
    ...(toneHint ? { toneHint } : {}),
    ...(finalMessageTone ? { finalMessageTone } : {}),
    ...(finalMessageVoiceInstructions ? { finalMessageVoiceInstructions } : {}),
    ...(selectedTemplateId ? { selectedTemplateId } : {}),
    ...(clipPlaybackSpeed ? { clipPlaybackSpeed } : {}),
    trimStartMs,
    trimEndMs,
    durationSeconds,
    messages,
    highlightedChatIds: packet.highlightedChatIds,
    highlightedMessages,
    players: packet.players,
    rawMaterials,
    capturePlan,
    factoryPacket: packet,
  };
}

export function normalizeClipDetailToQuoteJob(args: {
  detail: ClipDetailWire;
  source: SourceUrls;
  hookText?: string;
  toneHint?: string;
  finalMessageTone?: string;
  finalMessageVoiceInstructions?: string;
  selectedTemplateId?: string;
  clipPlaybackSpeed?: number;
}): QuoteJob {
  const {
    detail,
    source,
    hookText,
    toneHint,
    finalMessageTone,
    finalMessageVoiceInstructions,
    selectedTemplateId,
    clipPlaybackSpeed,
  } = args;
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
  const clipMessages = messages.map((message) =>
    toClipChatMessage({
        message,
        snapshot,
        players: detail.match.players,
        windowStartTimestamp,
        clipEndSeconds: Math.max(1, (windowEndTimestamp - windowStartTimestamp) / 1000),
        highlighted: highlightedIds.has(message.id),
      }),
  );
  const highlightedMessages = clipMessages
    .filter((message) => message.highlighted)
    .map(({ highlighted: _highlighted, ...message }) => message);

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
    messages: clipMessages,
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
    ...(hookText ? { hookText } : {}),
    ...(toneHint ? { toneHint } : {}),
    ...(finalMessageTone ? { finalMessageTone } : {}),
    ...(finalMessageVoiceInstructions ? { finalMessageVoiceInstructions } : {}),
    ...(selectedTemplateId ? { selectedTemplateId } : {}),
    ...(clipPlaybackSpeed ? { clipPlaybackSpeed } : {}),
    trimStartMs,
    trimEndMs,
    durationSeconds,
    messages: clipMessages,
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
  messages: ClipChatMessage[];
  highlightedChatIds: number[];
  highlightedMessages: HighlightedMessage[];
  players: ClipPlayerWire[];
  capturePlan: ClipRawMaterials["capturePlan"];
  factoryPacket?: ClipFactoryPacketWire;
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
    messages: args.messages,
    highlightedChatIds: args.highlightedChatIds,
    highlightedMessages: args.highlightedMessages,
    players: args.players,
    capturePlan: args.capturePlan,
    ...(args.factoryPacket ? { factoryPacket: args.factoryPacket } : {}),
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

export function packetMessageClipTiming(
  packet: ClipFactoryPacketWire,
  message: Pick<
    ClipFactoryPacketWire["messages"][number],
    "timestampMs" | "startSeconds" | "endSeconds"
  >,
): { timeStart: number; timeEnd: number } {
  const clockOffset = inferPacketTimingOffset(packet, message);
  const clipDuration =
    finitePositive(packet.clockMap.playbackDurationSeconds) ??
    finitePositive(packet.durationSeconds) ??
    Number.POSITIVE_INFINITY;
  const timeStart = clampSeconds(message.startSeconds - clockOffset, clipDuration);
  const timeEnd = clampSeconds(message.endSeconds - clockOffset, clipDuration);
  return {
    timeStart,
    timeEnd: Math.max(timeStart, timeEnd),
  };
}

function packetMessageToClipChatMessage(
  packet: ClipFactoryPacketWire,
  message: ClipFactoryPacketWire["messages"][number],
): ClipChatMessage {
  const timing = packetMessageClipTiming(packet, message);
  return {
    id: message.id,
    speaker: message.speaker,
    playerId: message.playerId,
    channel: message.channel,
    text: message.text,
    timeStart: timing.timeStart,
    timeEnd: timing.timeEnd,
    timestamp: message.timestampMs,
    highlighted: message.highlighted,
  };
}

function packetMessageToHighlightedMessage(
  packet: ClipFactoryPacketWire,
  message: ClipFactoryPacketWire["highlightedMessages"][number],
): HighlightedMessage {
  const timing = packetMessageClipTiming(packet, message);
  return {
    id: message.id,
    speaker: message.speaker,
    playerId: message.playerId,
    channel: message.channel,
    text: message.text,
    timeStart: timing.timeStart,
    timeEnd: timing.timeEnd,
    timestamp: message.timestampMs,
  };
}

function inferPacketTimingOffset(
  packet: ClipFactoryPacketWire,
  message: Pick<
    ClipFactoryPacketWire["messages"][number],
    "timestampMs" | "startSeconds" | "endSeconds"
  >,
): number {
  const playbackStartSeconds = finiteNonNegative(
    packet.clockMap.playbackStartSeconds,
  );
  if (!playbackStartSeconds) return 0;

  const clipDuration =
    finitePositive(packet.clockMap.playbackDurationSeconds) ??
    finitePositive(packet.durationSeconds);
  if (
    clipDuration !== undefined &&
    message.startSeconds > clipDuration &&
    message.startSeconds - playbackStartSeconds <= clipDuration
  ) {
    return playbackStartSeconds;
  }

  const timestampRelativeSeconds =
    (message.timestampMs - packet.clockMap.recordingStartMs) / 1000;
  if (!Number.isFinite(timestampRelativeSeconds)) return 0;

  const inferredOffset = message.startSeconds - timestampRelativeSeconds;
  return Math.abs(inferredOffset - playbackStartSeconds) <= 0.25
    ? playbackStartSeconds
    : 0;
}

function clampSeconds(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(duration, roundToTenth(value)));
}

function finitePositive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function capturePlanFromFactoryPacket(
  packet: ClipFactoryPacketWire,
): ClipRawMaterials["capturePlan"] {
  const fallbackPlan = createPhoneReplayCapturePlan(
    packet.capturePlan.replayLayoutWidth,
  );
  return {
    ...fallbackPlan,
    viewport: packet.capturePlan.viewport,
    sourceLayout: {
      ...fallbackPlan.sourceLayout,
      width: packet.capturePlan.replayLayoutWidth,
    },
    replay: {
      ...fallbackPlan.replay,
      autoplay: packet.capturePlan.autoplay,
      readinessGlobal: "window.clankerClip.ready()",
      playbackApiGlobal: packet.capturePlan.playbackApiGlobal,
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

function toClipChatMessage(args: {
  message: ReturnType<typeof extractReplayChat>[number];
  snapshot: ClipSnapshot;
  players: { id: string; name: string }[];
  windowStartTimestamp: number;
  clipEndSeconds: number;
  highlighted: boolean;
}): ClipChatMessage {
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
    highlighted: args.highlighted,
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

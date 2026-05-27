import type {
  BaseRecordingTiming,
  ChatCueTimingArtifact,
  ClipCapturePlan,
  ClipRawMaterials,
  EditComposition,
} from "./edit-model";

export type ClipPlayerWire = {
  id: string;
  name: string;
};

export type ClipDetailWire = {
  version: number;
  clip: {
    id: string;
    momentType: string;
    title: string | null;
    views: number;
    likes: number;
    creatorUserId: string | null;
    highlightedChatIds: number[];
    createdAt: string;
    snapshot: ClipSnapshot;
    trimStartMs: number | null;
    trimEndMs: number | null;
  };
  match: {
    gameSlug: string;
    gameRevisionId: string | null;
    players: ClipPlayerWire[];
  };
};

export type ClipSnapshot = {
  schemaVersion: 1;
  capturedAt: number;
  durationMs: number;
  events: ClipSnapshotEvent[];
  playerDirectory?: Record<string, { name: string }>;
};

export type ClipSnapshotEvent =
  | {
      schemaVersion: 1;
      type: "chat";
      timestamp: number;
      message: {
        id?: string | number;
        playerId: string;
        text: string;
        channel: string;
        timestamp: number;
        whisperTo?: string;
        fromSpectator?: boolean;
      };
    }
  | {
      schemaVersion: 1;
      type: string;
      timestamp: number;
      [key: string]: unknown;
    };

export type HighlightedMessage = {
  id: number;
  speaker: string;
  playerId: string;
  channel: string;
  text: string;
  timeStart: number;
  timeEnd: number;
  timestamp: number;
};

export type ClipChatMessage = HighlightedMessage & {
  highlighted: boolean;
};

export type ClipTranscriptTimingConfidence = "exact" | "estimated";

export type ClipTranscriptRow = {
  id: number;
  speaker: string;
  playerId: string;
  identity?: {
    kind: string;
    playerId: string;
    displayName: string;
    agentId?: string;
    stableAgentId?: string;
    modelName?: string;
  };
  channel: string;
  text: string;
  timestampMs: number;
  startSeconds: number;
  endSeconds: number;
  highlighted: boolean;
  timingConfidence: ClipTranscriptTimingConfidence;
};

export type ClipClockMap = {
  recordingStartMs: number;
  recordingEndMs: number;
  playbackStartSeconds: number;
  playbackDurationSeconds: number;
};

export type ClipFactoryPacketWire = {
  version: 1;
  clipId: string;
  clipUrl: string;
  sourceUrl: string;
  playbackUrl: string;
  apiUrl: string;
  game: string;
  gameRevisionId: string | null;
  durationSeconds: number;
  trimStartMs: number | null;
  trimEndMs: number | null;
  highlightedChatIds: number[];
  players: ClipPlayerWire[];
  transcript: ClipTranscriptRow[];
  messages: ClipTranscriptRow[];
  highlightedMessages: ClipTranscriptRow[];
  capturePlan: {
    id: string;
    viewport: { width: number; height: number };
    replayLayoutWidth: number;
    chatHeightPct: number;
    readinessSignal: string;
    playbackApiGlobal: string;
    autoplay: boolean;
    startAtTrimStart: boolean;
  };
  projectionSummary: {
    perspective: unknown;
    clipStartTimestamp: number;
    clipEndTimestamp: number;
    clipDurationMs: number;
    eventCount: number;
    segmentCount: number;
    segmentBoundaries: number[];
  };
  safeAreas: {
    viewport: { width: number; height: number };
    replay: { x: number; y: number; width: number; height: number };
    captions: { x: number; y: number; width: number; height: number };
  };
  clockMap: ClipClockMap;
  editManifest: unknown;
  manifest?: unknown;
};

export type InternalAutomatedClipMomentType =
  | "automated"
  | "highlight"
  | "funny"
  | "drama";

export type InternalAutomatedClipRequest = {
  matchId: string;
  startMs: number;
  endMs: number;
  title?: string | null;
  momentScore?: number;
  momentType?: InternalAutomatedClipMomentType;
  highlightedChatIds?: number[];
};

export type InternalAutomatedClipResult = {
  version: number;
  clipId: string;
  url: string;
  matchId: string;
};

export type FactoryVideoSourceSnapshot =
  | {
      kind: "clip";
      clipId?: string;
      clipUrl?: string;
    }
  | {
      kind: "watchArchiveSelection";
      createClipRequest: InternalAutomatedClipRequest;
      automatedClip: InternalAutomatedClipResult;
    };

export type QuoteJob = {
  clipId: string;
  clipUrl: string;
  playbackUrl: string;
  game: string;
  source?: FactoryVideoSourceSnapshot;
  speaker: string;
  hookText?: string;
  toneHint?: string;
  finalMessageTone?: string;
  finalMessageVoiceInstructions?: string;
  selectedTemplateId?: string;
  clipPlaybackSpeed?: number;
  trimStartMs: number;
  trimEndMs: number;
  durationSeconds: number;
  messages?: ClipChatMessage[];
  highlightedChatIds: number[];
  highlightedMessages: HighlightedMessage[];
  players: ClipPlayerWire[];
  rawMaterials: ClipRawMaterials;
  capturePlan: ClipCapturePlan;
  factoryPacket?: ClipFactoryPacketWire;
};

export type EditRecipeVariant = {
  variantId: string;
  template: "narrator_quote_punchline";
  templateId?: string;
  setupLine: string;
  openingCaption: string;
  speaker: string;
  speakerExpression: "neutral" | "intense" | "confused" | "smug";
  quoteText: string;
  punchlinePhrase: string;
  highlightPhrases: string[];
  captionStyle: "dramatic" | "deadpan" | "glitch" | "roast";
  cta: string;
  composition?: EditComposition;
};

export type EditRecipe = {
  sourceClipId: string;
  variants: EditRecipeVariant[];
};

export type FactoryJob = {
  id: string;
  createdAt: string;
  status: {
    ingest: "complete";
    recipe: "complete";
    recording: "pending" | "complete" | "failed";
    render: "pending" | "complete" | "failed";
  };
  quoteJob: QuoteJob;
  editRecipe: EditRecipe;
  artifacts: {
    baseRecordingPath?: string;
    baseRecordingTiming?: BaseRecordingTiming;
    chatCueTiming?: ChatCueTimingArtifact;
    rawVideoPath?: string;
    factoryPacketPath?: string;
    renderedVideoPath?: string;
    renderedVariants?: Record<string, string>;
    error?: string;
  };
};

export type TemplateRecord = {
  id: string;
  name: string;
  description: string;
  thumbnailPath?: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  composition: EditComposition;
};

import type {
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

export type QuoteJob = {
  clipId: string;
  clipUrl: string;
  playbackUrl: string;
  game: string;
  speaker: string;
  hookText?: string;
  toneHint?: string;
  finalMessageTone?: string;
  finalMessageVoiceInstructions?: string;
  selectedTemplateId?: string;
  trimStartMs: number;
  trimEndMs: number;
  durationSeconds: number;
  highlightedChatIds: number[];
  highlightedMessages: HighlightedMessage[];
  players: ClipPlayerWire[];
  rawMaterials: ClipRawMaterials;
  capturePlan: ClipCapturePlan;
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
    rawVideoPath?: string;
    factoryPacketPath?: string;
    renderedVideoPath?: string;
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

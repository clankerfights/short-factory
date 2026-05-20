export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Box = Point & Size;

export type TimeRange = {
  start: number;
  duration: number;
};

export type ViewportFit = "cover" | "contain" | "fill";

export type LayerTransform = {
  scale?: number;
  opacity?: number;
  rotateDeg?: number;
};

export type KeyframedNumber = {
  from: number;
  to: number;
  easing?: "linear" | "easeOut" | "easeInOut";
};

export type ClipCapturePlan = {
  id: string;
  outputSize: Size;
  viewport: Size;
  sourceLayout: {
    width: number;
    heightMode: "viewport" | "content";
    scaleToViewportWidth: boolean;
  };
  replay: {
    autoplay: boolean;
    waitForReadySignal: boolean;
    readinessGlobal: "__CLIP_FACTORY_READY__";
    preferredPlaySelector: string;
  };
  chrome: {
    hideOverflow: boolean;
    hidePointerCursor: boolean;
    pageBackground: string;
  };
};

export type ClipFactoryPacket = {
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
  highlightedChatIds: readonly number[];
  players: Array<{ id: string; name: string }>;
  messages: ReadonlyArray<{
    id: number;
    speaker: string;
    playerId: string;
    channel: string;
    text: string;
    timestamp: number;
    timeStart: number;
    timeEnd: number;
    highlighted: boolean;
  }>;
  highlightedMessages: ReadonlyArray<{
    id: number;
    speaker: string;
    playerId: string;
    channel: string;
    text: string;
    timestamp: number;
    timeStart: number;
    timeEnd: number;
    highlighted: boolean;
  }>;
  capturePlan: {
    id: "phone-fit-replay-v1";
    viewport: Size;
    replayLayoutWidth: number;
    chatHeightPct: number;
    readinessSignal: "window.__CLIP_FACTORY_READY__";
    playbackTrigger: string;
    autoplay: boolean;
    startAtTrimStart: boolean;
  };
  projection: unknown;
  visibleChat: readonly unknown[];
  safeAreas: {
    viewport: Size;
    replay: Box;
  };
};

export type ClipRawMaterials = {
  clipId: string;
  sourceUrl: string;
  playbackUrl: string;
  game: string;
  trimWindowMs: {
    start: number;
    end: number;
  };
  durationSeconds: number;
  players: Array<{ id: string; name: string }>;
  highlightedChatIds: number[];
  highlightedMessages: Array<{
    id: number;
    speaker: string;
    playerId: string;
    channel: string;
    text: string;
    timeStart: number;
    timeEnd: number;
    timestamp: number;
  }>;
  capturePlan: ClipCapturePlan;
  recommendedFactoryMode: {
    queryParam: "factory";
    capabilities: string[];
  };
};

export type VideoSourceLayer = {
  id: string;
  kind: "video-source";
  time: TimeRange;
  source: "base-recording";
  box: Box;
  fit: ViewportFit;
  transform?: LayerTransform;
  animation?: {
    scale?: KeyframedNumber;
  };
  filters?: {
    contrast?: number;
    saturate?: number;
    blurPx?: number;
    opacity?: number;
  };
};

export type TextOverlayLayer = {
  id: string;
  kind: "text";
  time: TimeRange;
  text: string;
  box: Box;
  style: {
    fontSize: number;
    lineHeight: number;
    weight: number;
    color: string;
    accentColor?: string;
    background?: string;
    borderColor?: string;
    borderLeftColor?: string;
    textTransform?: "uppercase" | "none";
    shadow?: boolean;
    align?: "left" | "center";
  };
  emphasis?: {
    phrase: string;
    color: string;
  };
  animation?: {
    enterFromY?: number;
    punchInFrame?: number;
  };
};

export type SpeakerBadgeLayer = {
  id: string;
  kind: "speaker-badge";
  time: TimeRange;
  speaker: string;
  expression: "neutral" | "intense" | "confused" | "smug";
  box: Box;
  accentColor: string;
};

export type CtaLayer = {
  id: string;
  kind: "cta";
  time: TimeRange;
  text: string;
  box: Box;
  style: {
    background: string;
    color: string;
    fontSize: number;
    weight: number;
  };
};

export type EditLayer =
  | VideoSourceLayer
  | TextOverlayLayer
  | SpeakerBadgeLayer
  | CtaLayer;

export type EditComposition = {
  canvas: Size & {
    fps: number;
    durationFrames: number;
    background: string;
  };
  layers: EditLayer[];
};

export const TIKTOK_CANVAS = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationFrames: 720,
  background: "#05070a",
} as const;

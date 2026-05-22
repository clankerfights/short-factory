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

export type FreezeFrameEdit = {
  id: string;
  atFrame: number;
  durationFrames: number;
};

export type TrimFrameEdit = {
  startFrame: number;
  endFrame: number;
};

export type PlaybackSpeedEdit = {
  speed: number;
};

export type BaseRecordingTiming = {
  fps: number;
  recordedDurationFrames: number;
  clipStartFrame: number;
  clipEndFrame: number;
  clipDurationFrames: number;
  playbackRate: number;
  method: "play-start" | "backfill-detection" | "none";
  confidence: "high" | "medium" | "low";
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

export type EditLayerKind =
  | "video-source"
  | "text"
  | "speaker-badge"
  | "image"
  | "shape"
  | "zoom"
  | "callout"
  | "audio-file"
  | "tts"
  | "cta";

export type BaseEditLayer = {
  id: string;
  kind: EditLayerKind;
  name?: string;
  time: TimeRange;
  box?: Box;
  locked?: boolean;
  hidden?: boolean;
  zIndex?: number;
};

export type TextStyle = {
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
  align?: "left" | "center" | "right";
};

export type TtsSettings = {
  voice?: string;
  instructions?: string;
  volume?: number;
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
    playbackRate: number;
    waitForReadySignal: boolean;
    readinessGlobal: "__CLIP_FACTORY_READY__" | "window.clankerClip.ready()";
    playbackApiGlobal?: string;
    preferredPlaySelector: string;
  };
  chrome: {
    hideOverflow: boolean;
    hidePointerCursor: boolean;
    pageBackground: string;
  };
};

export type ClipFactoryTranscriptMessage = {
  id: number;
  speaker: string;
  playerId: string;
  channel: string;
  text: string;
  timestampMs: number;
  startSeconds: number;
  endSeconds: number;
  highlighted: boolean;
  timingConfidence: "exact" | "estimated";
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
  messages: ReadonlyArray<ClipFactoryTranscriptMessage>;
  highlightedMessages: ReadonlyArray<ClipFactoryTranscriptMessage>;
  transcript: ReadonlyArray<ClipFactoryTranscriptMessage>;
  capturePlan: {
    id: string;
    viewport: Size;
    replayLayoutWidth: number;
    chatHeightPct: number;
    readinessSignal: string;
    playbackApiGlobal: string;
    autoplay: boolean;
    startAtTrimStart: boolean;
  };
  projectionSummary: unknown;
  safeAreas: {
    viewport: Size;
    replay: Box;
    captions: Box;
  };
  clockMap: unknown;
  editManifest: unknown;
  manifest?: unknown;
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
  messages?: Array<{
    id: number;
    speaker: string;
    playerId: string;
    channel: string;
    text: string;
    timeStart: number;
    timeEnd: number;
    timestamp: number;
    highlighted: boolean;
  }>;
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
  factoryPacket?: ClipFactoryPacket;
  recommendedFactoryMode: {
    queryParam: "factory";
    capabilities: string[];
  };
};

export type VideoSourceLayer = BaseEditLayer & {
  kind: "video-source";
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

export type TextOverlayLayer = BaseEditLayer & {
  kind: "text";
  text: string;
  box: Box;
  style: TextStyle;
  emphasis?: {
    phrase: string;
    color: string;
  };
  tts?: TtsSettings;
  animation?: {
    enterFromY?: number;
    punchInFrame?: number;
  };
};

export type SpeakerBadgeLayer = BaseEditLayer & {
  kind: "speaker-badge";
  speaker: string;
  expression: "neutral" | "intense" | "confused" | "smug";
  box: Box;
  accentColor: string;
};

export type ImageLayer = BaseEditLayer & {
  kind: "image";
  src: string;
  box: Box;
  fit: ViewportFit;
  flipX?: boolean;
  opacity?: number;
  transform?: LayerTransform;
};

export type ShapeLayer = BaseEditLayer & {
  kind: "shape";
  shape: "rect" | "ellipse" | "line" | "arrow";
  box: Box;
  style: {
    fill: string;
    stroke?: string;
    strokeWidth?: number;
    radius?: number;
    opacity?: number;
  };
};

export type ZoomLayer = BaseEditLayer & {
  kind: "zoom";
  box: Box;
  easing?: "linear" | "easeOut" | "easeInOut";
};

export type CalloutLayer = BaseEditLayer & {
  kind: "callout";
  text: string;
  box: Box;
  style: TextStyle & {
    arrow?: "none" | "up" | "down" | "left" | "right";
  };
  tts?: TtsSettings;
};

export type AudioFileLayer = BaseEditLayer & {
  kind: "audio-file";
  src: string;
  volume: number;
};

export type TtsLayer = BaseEditLayer & {
  kind: "tts";
  text: string;
  speaker?: string;
  voice: string;
  instructions?: string;
  artifactPath?: string;
  src?: string;
  volume: number;
};

export type CtaLayer = BaseEditLayer & {
  kind: "cta";
  text: string;
  box: Box;
  style: {
    background: string;
    color: string;
    fontSize: number;
    weight: number;
  };
  tts?: TtsSettings;
};

export type EditLayer =
  | VideoSourceLayer
  | TextOverlayLayer
  | SpeakerBadgeLayer
  | ImageLayer
  | ShapeLayer
  | ZoomLayer
  | CalloutLayer
  | AudioFileLayer
  | TtsLayer
  | CtaLayer;

export type EditComposition = {
  templateId?: string;
  templateName?: string;
  templateVersion?: number;
  canvas: Size & {
    fps: number;
    durationFrames: number;
    background: string;
  };
  timelineEdits?: {
    trim?: TrimFrameEdit;
    playback?: PlaybackSpeedEdit;
    freezes?: FreezeFrameEdit[];
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

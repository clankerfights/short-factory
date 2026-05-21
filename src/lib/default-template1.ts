import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  EditComposition,
  EditLayer,
  FreezeFrameEdit,
  TtsLayer,
} from "./edit-model";
import { TIKTOK_CANVAS } from "./edit-model";
import { botFaceForSpeaker } from "./bot-assets";
import { outputFrameForSourceFrame } from "./composition-utils";
import { jobDirectory } from "./job-store";
import { generateOpenAiSpeech } from "./tts";
import type { EditRecipeVariant, FactoryJob } from "./types";
import { voiceForSpeaker } from "./voice-registry";

export const DEFAULT_TEMPLATE1_ID = "default-template1";
export const DEFAULT_TEMPLATE1_NAME = "Default Template1";
export const DEFAULT_TEMPLATE1_VERSION = 2;

const OUTRO_FRAMES = TIKTOK_CANVAS.fps * 2;

export async function applyDefaultTemplate1(
  job: FactoryJob,
  variant: EditRecipeVariant,
): Promise<EditComposition> {
  if (isCurrentDefaultTemplate1(variant.composition)) {
    return variant.composition;
  }

  const fps = TIKTOK_CANVAS.fps;
  const sourceDuration = Math.max(1, Math.round(job.quoteJob.durationSeconds * fps));
  const speaker = job.quoteJob.speaker || variant.speaker;
  const hookText = variant.setupLine || variant.openingCaption;
  const introSpeech = await createTtsLayer({
    job,
    id: "tts-default-template1-hook",
    name: "Hook voiceover",
    text: hookText,
    speaker: "Narrator",
    startFrame: 0,
    preferredVoice: "onyx",
  });
  const introFrames = Math.max(fps, introSpeech.time.duration);

  const highlighted = [...job.quoteJob.highlightedMessages].sort(
    (a, b) => a.timeStart - b.timeStart,
  );
  const speechLayers: TtsLayer[] = [];
  const freezes: FreezeFrameEdit[] = [];
  const faceLayers: EditLayer[] = [];
  const highlightIds = new Map<string, number>();
  const highlightReads: HighlightRead[] = [];

  for (let index = 0; index < highlighted.length; index += 1) {
    const message = highlighted[index];
    const highlightId = uniqueHighlightId(message.id, highlightIds);
    const sourceFrame = clampFrame(Math.round(message.timeStart * fps), sourceDuration);
    const isFinalHighlight = index === highlighted.length - 1;
    const speech = await createTtsLayer({
      job,
      id: `tts-highlight-${highlightId}`,
      name: `${message.speaker} voiceover`,
      text: message.text,
      speaker: message.speaker,
      startFrame: 0,
      instructions: isFinalHighlight ? job.quoteJob.finalMessageVoiceInstructions : undefined,
    });
    highlightReads.push({ id: highlightId, sourceFrame, message, speech, index });
  }

  const readClusters = clusterHighlightReadsForFreeze(
    highlightReads.map((read) => ({
      id: read.id,
      sourceFrame: read.sourceFrame,
      durationFrames: read.speech.time.duration,
    })),
  );
  const readsById = new Map(highlightReads.map((read) => [read.id, read]));

  for (const cluster of readClusters) {
    const clusterStart =
      introFrames + outputFrameForSourceFrame(cluster.sourceFrame, freezes, sourceDuration);
    let readOffset = 0;

    freezes.push({
      id: `freeze-highlight-${cluster.id}`,
      atFrame: cluster.sourceFrame,
      durationFrames: cluster.durationFrames,
    });

    for (const clusteredRead of cluster.reads) {
      const read = readsById.get(clusteredRead.id);
      if (!read) continue;

      const speechStart = clusterStart + readOffset;
      const speech = {
        ...read.speech,
        time: { ...read.speech.time, start: speechStart },
      };
      speechLayers.push(speech);

      const face = botFaceForSpeaker(read.message.speaker);
      if (face) {
        faceLayers.push({
          id: `face-highlight-${read.id}`,
          kind: "image",
          name: `${read.message.speaker} face`,
          time: { start: speechStart, duration: speech.time.duration },
          box: faceBoxForIndex(read.index),
          zIndex: 40 + read.index,
          src: face.src,
          fit: "contain",
        });
      }

      readOffset += speech.time.duration;
    }
  }

  const videoEndFrame =
    introFrames +
    sourceDuration +
    freezes.reduce((total, freeze) => total + freeze.durationFrames, 0);
  const outroStart = videoEndFrame;
  const totalDuration = outroStart + OUTRO_FRAMES;
  const speakerFace = botFaceForSpeaker(speaker);

  const layers: EditLayer[] = [
    {
      id: "base-recording",
      kind: "video-source",
      source: "base-recording",
      name: "Clip video",
      time: { start: introFrames, duration: sourceDuration },
      box: { x: 0, y: 0, width: TIKTOK_CANVAS.width, height: TIKTOK_CANVAS.height },
      fit: "cover",
      zIndex: 0,
    },
    {
      id: "intro-white-background",
      kind: "shape",
      name: "Hook white background",
      time: { start: 0, duration: introFrames },
      box: { x: 0, y: 0, width: TIKTOK_CANVAS.width, height: TIKTOK_CANVAS.height },
      zIndex: 10,
      shape: "rect",
      style: { fill: "#ffffff", stroke: "transparent", strokeWidth: 0, opacity: 1 },
    },
    {
      id: "opening-caption",
      kind: "text",
      name: "Setup hook",
      time: { start: 0, duration: introFrames },
      text: hookText,
      box: { x: 62, y: 88, width: 956, height: 520 },
      zIndex: 20,
      style: {
        fontSize: fitHookFontSize(hookText),
        lineHeight: 0.96,
        weight: 950,
        color: "#090909",
        textTransform: "uppercase",
        align: "center",
      },
    },
    introSpeech,
    ...introFaceLayer(speakerFace?.src, introFrames),
    ...faceLayers,
    ...speechLayers,
    {
      id: "outro-white-background",
      kind: "shape",
      name: "Outro white background",
      time: { start: outroStart, duration: OUTRO_FRAMES },
      box: { x: 0, y: 0, width: TIKTOK_CANVAS.width, height: TIKTOK_CANVAS.height },
      zIndex: 90,
      shape: "rect",
      style: { fill: "#ffffff", stroke: "transparent", strokeWidth: 0, opacity: 1 },
    },
    {
      id: "outro-cta",
      kind: "text",
      name: "Outro clankerfights.ai",
      time: { start: outroStart, duration: OUTRO_FRAMES },
      text: "clankerfights.ai",
      box: { x: 80, y: 820, width: 920, height: 220 },
      zIndex: 100,
      style: {
        fontSize: 86,
        lineHeight: 1,
        weight: 950,
        color: "#090909",
        align: "center",
      },
    },
  ];

  return {
    templateId: DEFAULT_TEMPLATE1_ID,
    templateName: DEFAULT_TEMPLATE1_NAME,
    templateVersion: DEFAULT_TEMPLATE1_VERSION,
    canvas: {
      ...TIKTOK_CANVAS,
      background: "#ffffff",
      durationFrames: totalDuration,
    },
    timelineEdits: { freezes },
    layers,
  };
}

export function isCurrentDefaultTemplate1(
  composition: EditComposition | undefined,
): composition is EditComposition {
  return (
    composition?.templateId === DEFAULT_TEMPLATE1_ID &&
    composition.templateVersion === DEFAULT_TEMPLATE1_VERSION
  );
}

async function createTtsLayer(args: {
  job: FactoryJob;
  id: string;
  name: string;
  text: string;
  speaker: string;
  startFrame: number;
  preferredVoice?: string;
  instructions?: string;
}): Promise<TtsLayer> {
  const profile = voiceForSpeaker(args.speaker);
  const voice = args.preferredVoice ?? profile.voice;
  const instructions = args.instructions ?? profile.instructions;
  const relativePath = path.join("assets", "tts", `${safeFileName(args.id)}.mp3`);
  const absolutePath = path.join(jobDirectory(args.job.id), relativePath);
  let durationSeconds = estimateSpeechSeconds(args.text);
  let src: string | undefined;

  try {
    const existingAudio = await fs.readFile(absolutePath);
    durationSeconds = mp3DurationSeconds(existingAudio) ?? durationSeconds;
    src = relativePath.replaceAll("\\", "/");
  } catch {
    try {
      const audio = await generateOpenAiSpeech({
        text: args.text,
        voice,
        instructions,
      });
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, audio);
      durationSeconds = mp3DurationSeconds(audio) ?? durationSeconds;
      src = relativePath.replaceAll("\\", "/");
    } catch {
      src = undefined;
    }
  }

  return {
    id: args.id,
    kind: "tts",
    name: args.name,
    time: {
      start: args.startFrame,
      duration: Math.max(1, Math.ceil(durationSeconds * TIKTOK_CANVAS.fps)),
    },
    zIndex: 80,
    text: args.text,
    speaker: args.speaker,
    voice,
    instructions,
    src,
    artifactPath: src ? absolutePath : undefined,
    volume: 1,
  };
}

type HighlightRead = {
  id: string;
  sourceFrame: number;
  message: FactoryJob["quoteJob"]["highlightedMessages"][number];
  speech: TtsLayer;
  index: number;
};

export type HighlightFreezeReadTiming = {
  id: string;
  sourceFrame: number;
  durationFrames: number;
};

export type HighlightFreezeCluster = {
  id: string;
  sourceFrame: number;
  durationFrames: number;
  reads: HighlightFreezeReadTiming[];
};

export function clusterHighlightReadsForFreeze(
  reads: HighlightFreezeReadTiming[],
  toleranceFrames = Math.round(TIKTOK_CANVAS.fps * 0.4),
  maxSourceGapFrames = Math.round(TIKTOK_CANVAS.fps * 4),
): HighlightFreezeCluster[] {
  const sortedReads = [...reads]
    .filter((read) => read.durationFrames > 0)
    .sort((a, b) => a.sourceFrame - b.sourceFrame);
  const clusters: HighlightFreezeCluster[] = [];
  let current: HighlightFreezeCluster | null = null;

  for (const read of sortedReads) {
    const normalizedRead = {
      ...read,
      sourceFrame: Math.max(0, Math.round(read.sourceFrame)),
      durationFrames: Math.max(1, Math.round(read.durationFrames)),
    };

    if (!current) {
      current = clusterFromRead(normalizedRead);
      continue;
    }

    const lastRead = current.reads[current.reads.length - 1];
    const currentReadEnd = current.sourceFrame + current.durationFrames + toleranceFrames;
    const sourceGap = normalizedRead.sourceFrame - (lastRead?.sourceFrame ?? current.sourceFrame);
    if (sourceGap <= maxSourceGapFrames && normalizedRead.sourceFrame <= currentReadEnd) {
      current.reads.push(normalizedRead);
      current.durationFrames += normalizedRead.durationFrames;
      current.id = clusterId(current.reads);
      continue;
    }

    clusters.push(current);
    current = clusterFromRead(normalizedRead);
  }

  if (current) clusters.push(current);
  return clusters;
}

function clusterFromRead(read: HighlightFreezeReadTiming): HighlightFreezeCluster {
  return {
    id: read.id,
    sourceFrame: read.sourceFrame,
    durationFrames: read.durationFrames,
    reads: [read],
  };
}

function clusterId(reads: HighlightFreezeReadTiming[]): string {
  const first = reads[0]?.id ?? "read";
  const last = reads[reads.length - 1]?.id ?? first;
  return first === last ? first : `${first}-to-${last}`;
}

function introFaceLayer(src: string | undefined, duration: number): EditLayer[] {
  if (!src) return [];
  return [
    {
      id: "intro-speaker-face",
      kind: "image",
      name: "Punchline AI face",
      time: { start: 0, duration },
      box: { x: 150, y: 790, width: 780, height: 880 },
      zIndex: 25,
      src,
      fit: "contain",
    },
  ];
}

function faceBoxForIndex(index: number) {
  const right = index % 2 === 0;
  return {
    x: right ? 690 : 50,
    y: 965,
    width: 340,
    height: 340,
  };
}

function clampFrame(frame: number, duration: number): number {
  return Math.max(0, Math.min(duration - 1, frame));
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]/gi, "_").slice(0, 80) || "tts";
}

function uniqueHighlightId(
  messageId: string | number,
  seen: Map<string, number>,
): string {
  const base = safeFileName(String(messageId));
  const previousCount = seen.get(base) ?? 0;
  seen.set(base, previousCount + 1);
  return previousCount === 0 ? base : `${base}-${previousCount + 1}`;
}

function fitHookFontSize(text: string): number {
  if (text.length > 90) return 66;
  if (text.length > 62) return 78;
  return 92;
}

function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, words / 2.8 + 0.4);
}

function mp3DurationSeconds(buffer: Buffer): number | null {
  let offset = id3v2Size(buffer);
  let duration = 0;
  let frames = 0;

  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const header = parseMp3Header(buffer, offset);
    if (!header) {
      offset += 1;
      continue;
    }

    duration += header.samplesPerFrame / header.sampleRate;
    frames += 1;
    offset += header.frameLength;
  }

  return frames > 0 ? duration : null;
}

function id3v2Size(buffer: Buffer): number {
  if (buffer.length < 10 || buffer.toString("utf8", 0, 3) !== "ID3") return 0;
  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);
  return 10 + size;
}

function parseMp3Header(buffer: Buffer, offset: number) {
  const byte1 = buffer[offset + 1];
  const byte2 = buffer[offset + 2];
  const byte3 = buffer[offset + 3];
  const versionBits = (byte1 >> 3) & 0x03;
  const layerBits = (byte1 >> 1) & 0x03;
  const bitrateIndex = (byte2 >> 4) & 0x0f;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  const padding = (byte2 >> 1) & 0x01;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const version = versionBits === 3 ? "mpeg1" : "mpeg2";
  const bitrate = (version === "mpeg1" ? BITRATES_MPEG1_LAYER3 : BITRATES_MPEG2_LAYER3)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[versionBits][sampleRateIndex];
  const samplesPerFrame = version === "mpeg1" ? 1152 : 576;
  const frameLength = Math.floor((samplesPerFrame / 8 * bitrate) / sampleRate) + padding;
  if (!Number.isFinite(frameLength) || frameLength <= 4) return null;
  return { frameLength, sampleRate, samplesPerFrame };
}

const BITRATES_MPEG1_LAYER3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
] as const;
const BITRATES_MPEG2_LAYER3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
] as const;
const SAMPLE_RATES: Record<number, readonly number[]> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
};

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { EditComposition, EditLayer, TtsLayer } from "./edit-model";
import { TIKTOK_CANVAS } from "./edit-model";
import { mp3DurationSeconds } from "./audio-duration";
import { botFaceForSpeaker } from "./bot-assets";
import { chatGameplayStartFrame, highlightedChatReadFrame } from "./chat-cue-timing";
import { outputDurationForTimelineEdits } from "./composition-utils";
import { planHighlightReadFreezes } from "./highlight-freeze-planner";
import { jobDirectory } from "./job-store";
import { packetMessageClipTiming } from "./normalize-clip";
import { parseClipFactoryPacketWire } from "./schemas";
import { generateOpenAiSpeech } from "./tts";
import type { ClipFactoryPacketWire, EditRecipeVariant, FactoryJob } from "./types";
import { shortModelNameForSpeaker } from "./model-personas";
import { voiceForSpeaker } from "./voice-registry";

export const DEFAULT_TEMPLATE1_ID = "default-template1";
export const DEFAULT_TEMPLATE1_NAME = "Default Template1";
export const DEFAULT_TEMPLATE1_VERSION = 13;

const DEFAULT_TEMPLATE1_TIMING = {
  gameplaySpeed: 2,
  finalHighlightPostrollSeconds: 0.55,
} as const;
const OUTRO_WOOSH_SRC = "sound-effects/alexis_gaming_cam-woosh-long-cartoon-370386.mp3";
const TIKTOK_HOOK_FONT =
  '"TikTok Sans", Montserrat, "Arial Black", Impact, system-ui, sans-serif';

export async function applyDefaultTemplate1(
  job: FactoryJob,
  variant: EditRecipeVariant,
): Promise<EditComposition> {
  if (isCurrentDefaultTemplate1(variant.composition)) {
    return variant.composition;
  }

  const fps = TIKTOK_CANVAS.fps;
  const baseSourceDurationSeconds =
    finitePositive(job.quoteJob.factoryPacket?.clockMap.playbackDurationSeconds) ??
    finitePositive(job.quoteJob.factoryPacket?.durationSeconds) ??
    finitePositive(job.quoteJob.rawMaterials.factoryPacket?.durationSeconds) ??
    job.quoteJob.durationSeconds;
  const hookText = variant.setupLine || variant.openingCaption;
  const introSpeech = await createTtsLayer({
    job,
    id: "tts-default-template1-hook",
    name: "Hook voiceover",
    text: hookText,
    speaker: "Narrator",
    startFrame: 0,
  });
  const introFrames = introSpeech.time.duration;

  const allChatMessages = await chatMessagesForTemplate(job);
  const highlightedFromTranscript = allChatMessages.filter((message) => message.highlighted);
  const highlighted = highlightedFromTranscript.length
    ? highlightedFromTranscript
    : sortChatMessages(job.quoteJob.highlightedMessages);
  const finalHighlightedMessage = highlighted[highlighted.length - 1];
  const introSpeaker = finalHighlightedMessage?.speaker ?? variant.speaker;
  const introFace = botFaceForSpeaker(introSpeaker);
  const introModelName = shortModelNameForSpeaker(introSpeaker);
  const sourceDurationSeconds = Math.max(
    baseSourceDurationSeconds,
    finalHighlightedMessage
      ? finalHighlightedMessage.timeStart +
          DEFAULT_TEMPLATE1_TIMING.finalHighlightPostrollSeconds
      : 0,
  );
  const rawSourceDuration = Math.max(1, Math.round(sourceDurationSeconds * fps));
  const firstChatMessage = allChatMessages[0];
  const firstChatFrame =
    firstChatMessage !== undefined
      ? chatGameplayStartFrame({
          message: firstChatMessage,
          fps,
          sourceDurationFrames: rawSourceDuration,
        })
      : 0;
  const highlightedFrames = highlighted.map((message) =>
    highlightedChatReadFrame({
      message,
      firstChatMessage,
      firstChatFrame,
      fps,
      sourceDurationFrames: rawSourceDuration,
    }),
  );
  const gameplayStartFrame = firstChatFrame;
  const gameplaySourceDuration = Math.max(1, rawSourceDuration - gameplayStartFrame);
  const playback = {
    speed: job.quoteJob.clipPlaybackSpeed ?? DEFAULT_TEMPLATE1_TIMING.gameplaySpeed,
  };
  const speechLayers: TtsLayer[] = [];
  const faceLayers: EditLayer[] = [];
  const highlightIds = new Map<string, number>();
  const highlightReads: HighlightRead[] = [];

  for (let index = 0; index < highlighted.length; index += 1) {
    const message = highlighted[index];
    const highlightId = uniqueHighlightId(message.id, highlightIds);
    const sourceFrame = Math.max(0, highlightedFrames[index] - gameplayStartFrame);
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

  const highlightPlan = planHighlightReadFreezes({
    reads: highlightReads.map((read) => ({
      id: read.id,
      sourceFrame: read.sourceFrame,
      durationFrames: read.speech.time.duration,
    })),
    sourceDuration: gameplaySourceDuration,
    outputOffsetFrames: introFrames,
    playback,
  });
  const readsById = new Map(highlightReads.map((read) => [read.id, read]));

  for (const plannedRead of highlightPlan.reads) {
    const read = readsById.get(plannedRead.id);
    if (!read) continue;

    const speech = {
      ...read.speech,
      time: { ...read.speech.time, start: plannedRead.outputStartFrame },
    };
    speechLayers.push(speech);

    const face = botFaceForSpeaker(read.message.speaker);
    if (face) {
      faceLayers.push({
        id: `face-highlight-${read.id}`,
        kind: "image",
        name: `${read.message.speaker} face`,
        time: { start: speech.time.start, duration: speech.time.duration },
        box: faceBoxForIndex(read.index),
        zIndex: 40 + read.index,
        src: face.src,
        fit: "contain",
      });
    }
  }

  const timelineEdits = {
    trim: { startFrame: gameplayStartFrame, endFrame: rawSourceDuration },
    playback,
    freezes: highlightPlan.freezes,
  };
  const videoEndFrame =
    introFrames + outputDurationForTimelineEdits(rawSourceDuration, timelineEdits);
  const outroStart = videoEndFrame;
  const outroFrames = await audioAssetDurationFrames(OUTRO_WOOSH_SRC);
  const totalDuration = outroStart + outroFrames;

  const layers: EditLayer[] = [
    {
      id: "base-recording",
      kind: "video-source",
      source: "base-recording",
      name: "Clip video",
      time: { start: introFrames, duration: rawSourceDuration },
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
        lineHeight: 0.88,
        fontFamily: TIKTOK_HOOK_FONT,
        weight: 900,
        color: "#ffffff",
        accentColor: "#ff0050",
        strokeColor: "#090909",
        strokeWidth: 7,
        shadow: true,
        textTransform: "uppercase",
        align: "center",
      },
    },
    introSpeech,
    ...introFaceLayer({
      src: introFace?.src,
      duration: introFrames,
      modelName: introModelName,
      game: job.quoteJob.game,
    }),
    ...faceLayers,
    ...speechLayers,
    {
      id: "outro-white-background",
      kind: "shape",
      name: "Outro white background",
      time: { start: outroStart, duration: outroFrames },
      box: { x: 0, y: 0, width: TIKTOK_CANVAS.width, height: TIKTOK_CANVAS.height },
      zIndex: 90,
      shape: "rect",
      style: { fill: "#ffffff", stroke: "transparent", strokeWidth: 0, opacity: 1 },
    },
    {
      id: "outro-cta",
      kind: "text",
      name: "Outro clankerfights.ai",
      time: { start: outroStart, duration: outroFrames },
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
    {
      id: "outro-woosh-long-cartoon",
      kind: "audio-file",
      name: "Outro woosh-long-cartoon",
      time: { start: outroStart, duration: outroFrames },
      zIndex: 101,
      src: OUTRO_WOOSH_SRC,
      volume: 0.85,
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
    timelineEdits,
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
  const relativePath = path.join(
    "assets",
    "tts",
    `${safeFileName(args.id)}-${speechSettingsHash(args.text, voice, instructions)}.mp3`,
  );
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
  message: TemplateChatMessage;
  speech: TtsLayer;
  index: number;
};

export type HighlightFreezeReadTiming = {
  id: string;
  sourceFrame: number;
  durationFrames: number;
};

function introFaceLayer(args: {
  src: string | undefined;
  duration: number;
  modelName?: string;
  game: string;
}): EditLayer[] {
  if (!args.src) return [];
  const layers: EditLayer[] = [
    {
      id: "intro-speaker-face",
      kind: "image",
      name: "Final speaker intro face",
      time: { start: 0, duration: args.duration },
      box: { x: 150, y: 700, width: 780, height: 780 },
      zIndex: 25,
      src: args.src,
      fit: "contain",
    },
  ];
  if (args.modelName) {
    layers.push({
      id: "intro-speaker-model-label",
      kind: "text",
      name: "Final speaker model label",
      time: { start: 0, duration: args.duration },
      text: `${args.modelName}\nplays ${args.game}`,
      box: { x: 96, y: 1512, width: 888, height: 210 },
      zIndex: 30,
      style: {
        fontFamily: TIKTOK_HOOK_FONT,
        fontSize: fitIntroModelFontSize(args.modelName),
        lineHeight: 1.05,
        weight: 900,
        color: "#090909",
        align: "center",
        whiteSpace: "pre-line",
      },
    });
  }
  return layers;
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

type TemplateChatMessage = {
  id: number;
  speaker: string;
  playerId: string;
  channel: string;
  text: string;
  timeStart: number;
  timeEnd: number;
  timestamp: number;
  highlighted?: boolean;
};

async function chatMessagesForTemplate(job: FactoryJob): Promise<TemplateChatMessage[]> {
  const embeddedPacket =
    job.quoteJob.factoryPacket ?? job.quoteJob.rawMaterials.factoryPacket;
  const parsedEmbeddedPacket = embeddedPacket
    ? parseClipFactoryPacketWire(embeddedPacket)
    : undefined;
  if (parsedEmbeddedPacket?.messages.length) {
    return sortChatMessages(
      parsedEmbeddedPacket.messages.map((message) =>
        packetMessageToTemplate(parsedEmbeddedPacket, message),
      ),
    );
  }

  if (job.artifacts.factoryPacketPath) {
    try {
      const packet = JSON.parse(
        await fs.readFile(job.artifacts.factoryPacketPath, "utf8"),
      );
      const parsedPacket = parseClipFactoryPacketWire(packet);
      if (parsedPacket.messages.length > 0) {
        return sortChatMessages(
          parsedPacket.messages.map((message) =>
            packetMessageToTemplate(parsedPacket, message),
          ),
        );
      }
    } catch {
      // Older jobs may not have a usable packet; normalized job chat is the best fallback.
    }
  }

  const fromJob = job.quoteJob.messages ?? job.quoteJob.rawMaterials.messages;
  if (fromJob?.length) return sortChatMessages(fromJob);

  return sortChatMessages(job.quoteJob.highlightedMessages);
}

function sortChatMessages<T extends TemplateChatMessage>(messages: readonly T[]): T[] {
  return [...messages].sort((a, b) => a.timeStart - b.timeStart);
}

function packetMessageToTemplate(
  packet: ClipFactoryPacketWire,
  message: ClipFactoryPacketWire["messages"][number],
): TemplateChatMessage {
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

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]/gi, "_").slice(0, 80) || "tts";
}

function speechSettingsHash(text: string, voice: string, instructions: string): string {
  return createHash("sha1")
    .update(JSON.stringify({ text, voice, instructions }))
    .digest("hex")
    .slice(0, 10);
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
  if (text.length > 90) return 72;
  if (text.length > 62) return 88;
  return 108;
}

function fitIntroModelFontSize(modelId: string): number {
  if (modelId.length > 36) return 34;
  if (modelId.length > 28) return 38;
  return 42;
}

async function audioAssetDurationFrames(src: string): Promise<number> {
  const normalized = src.replace(/^\/+/, "");
  const relativePath = normalized.startsWith("assets/")
    ? normalized
    : path.join("assets", normalized);
  try {
    const audio = await fs.readFile(path.join(process.cwd(), relativePath));
    const durationSeconds = mp3DurationSeconds(audio);
    if (durationSeconds && Number.isFinite(durationSeconds)) {
      return Math.max(1, Math.ceil(durationSeconds * TIKTOK_CANVAS.fps));
    }
  } catch {
    // Missing optional sound effects should not block template generation.
  }
  return TIKTOK_CANVAS.fps;
}

function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, words / 2.8 + 0.4);
}

function finitePositive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}


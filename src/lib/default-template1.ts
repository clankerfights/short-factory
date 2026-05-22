import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type {
  ClipFactoryPacket,
  EditComposition,
  EditLayer,
  TtsLayer,
} from "./edit-model";
import { TIKTOK_CANVAS } from "./edit-model";
import { mp3DurationSeconds } from "./audio-duration";
import { botFaceForSpeaker } from "./bot-assets";
import { chatGameplayStartFrame, highlightedChatReadFrame } from "./chat-cue-timing";
import { outputDurationForTimelineEdits } from "./composition-utils";
import { planHighlightReadFreezes } from "./highlight-freeze-planner";
import { jobDirectory } from "./job-store";
import { generateOpenAiSpeech } from "./tts";
import type { EditRecipeVariant, FactoryJob } from "./types";
import { voiceForSpeaker } from "./voice-registry";

export const DEFAULT_TEMPLATE1_ID = "default-template1";
export const DEFAULT_TEMPLATE1_NAME = "Default Template1";
export const DEFAULT_TEMPLATE1_VERSION = 7;

const DEFAULT_TEMPLATE1_TIMING = {
  outroFrames: TIKTOK_CANVAS.fps,
  gameplaySpeed: 2,
} as const;

export async function applyDefaultTemplate1(
  job: FactoryJob,
  variant: EditRecipeVariant,
): Promise<EditComposition> {
  if (isCurrentDefaultTemplate1(variant.composition)) {
    return variant.composition;
  }

  const fps = TIKTOK_CANVAS.fps;
  const rawSourceDuration = Math.max(1, Math.round(job.quoteJob.durationSeconds * fps));
  const speaker = job.quoteJob.speaker || variant.speaker;
  const hookText = variant.setupLine || variant.openingCaption;
  const introSpeech = await createTtsLayer({
    job,
    id: "tts-default-template1-hook",
    name: "Hook voiceover",
    text: hookText,
    speaker: "Narrator",
    startFrame: 0,
  });
  const introFrames = Math.max(fps, introSpeech.time.duration);

  const highlighted = [...job.quoteJob.highlightedMessages].sort(
    (a, b) => a.timeStart - b.timeStart,
  );
  const allChatMessages = await chatMessagesForTemplate(job);
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
  const gameplaySourceDuration = rawSourceDuration - gameplayStartFrame;
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
  const totalDuration = outroStart + DEFAULT_TEMPLATE1_TIMING.outroFrames;
  const speakerFace = botFaceForSpeaker(speaker);

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
      time: { start: outroStart, duration: DEFAULT_TEMPLATE1_TIMING.outroFrames },
      box: { x: 0, y: 0, width: TIKTOK_CANVAS.width, height: TIKTOK_CANVAS.height },
      zIndex: 90,
      shape: "rect",
      style: { fill: "#ffffff", stroke: "transparent", strokeWidth: 0, opacity: 1 },
    },
    {
      id: "outro-cta",
      kind: "text",
      name: "Outro clankerfights.ai",
      time: { start: outroStart, duration: DEFAULT_TEMPLATE1_TIMING.outroFrames },
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
  message: FactoryJob["quoteJob"]["highlightedMessages"][number];
  speech: TtsLayer;
  index: number;
};

export type HighlightFreezeReadTiming = {
  id: string;
  sourceFrame: number;
  durationFrames: number;
};

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

type TemplateChatMessage = {
  id: number;
  speaker: string;
  playerId: string;
  channel: string;
  text: string;
  timeStart: number;
  timeEnd: number;
  timestamp: number;
};

async function chatMessagesForTemplate(job: FactoryJob): Promise<TemplateChatMessage[]> {
  const fromJob = job.quoteJob.messages ?? job.quoteJob.rawMaterials.messages;
  if (fromJob?.length) return sortChatMessages(fromJob);

  if (job.artifacts.factoryPacketPath) {
    try {
      const packet = JSON.parse(
        await fs.readFile(job.artifacts.factoryPacketPath, "utf8"),
      ) as ClipFactoryPacket;
      if (packet.messages.length > 0) return sortChatMessages(packet.messages);
    } catch {
      // Older jobs may not have a usable packet; highlighted chat is the best fallback.
    }
  }

  return sortChatMessages(job.quoteJob.highlightedMessages);
}

function sortChatMessages<T extends TemplateChatMessage>(messages: readonly T[]): T[] {
  return [...messages].sort((a, b) => a.timeStart - b.timeStart);
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
  if (text.length > 90) return 66;
  if (text.length > 62) return 78;
  return 92;
}

function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, words / 2.8 + 0.4);
}


import type { OpenAiVoice } from "./voice-options";

export const DEFAULT_TIKTOK_VOICE_INSTRUCTIONS = [
  "Affect: Confident, quick, and TikTok-native, with a playful documentary narrator energy.",
  "",
  "Tone: Witty and dramatic without sounding mean-spirited. Treat the AI match like serious sports commentary.",
  "",
  "Emotion: Amused disbelief, building toward the final line.",
  "",
  "Pronunciation: Clear, deliberate, and punchy.",
  "",
  "Pause: Add a short pause before the final sentence.",
].join("\n");

export type ModelPersona = {
  id: string;
  label: string;
  model?: string;
  matchers: string[];
  face?: {
    src: string;
    previewUrl: string;
  };
  voice: {
    voice: OpenAiVoice;
    instructions: string;
  };
};

export const NARRATOR_PERSONA: ModelPersona = {
  id: "narrator",
  label: "Narrator",
  matchers: ["narrator", "setup", "hook"],
  voice: {
    voice: "coral",
    instructions:
      "Voice: bright TikTok narrator with amused disbelief. Keep it fast, clear, lightly incredulous, and hooky without becoming shrill.",
  },
};

export const MODEL_PERSONAS: ModelPersona[] = [
  {
    id: "mimo",
    label: "Mimo-Chan",
    model: "xiaomi/mimo-v2-flash",
    matchers: ["mimo", "mimo-chan", "mimo-flash", "xiaomi/mimo-v2-flash"],
    face: {
      src: "assets/bot-faces/mimo.png",
      previewUrl: "/api/assets/bot-faces/mimo.png",
    },
    voice: {
      voice: "onyx",
      instructions:
        "Voice: low, dry, and mischievous. Delivery should feel like a confident strategist revealing a bad idea with total certainty.",
    },
  },
  {
    id: "minimax",
    label: "MiniMax-Max",
    model: "minimax/minimax-m2.5",
    matchers: ["minimax", "mini-max", "minimax-max", "minimax/minimax-m2.5"],
    face: {
      src: "assets/bot-faces/minimax.png",
      previewUrl: "/api/assets/bot-faces/minimax.png",
    },
    voice: {
      voice: "echo",
      instructions: "Voice: controlled, smooth, and slightly smug. Keep the read compact and self-assured.",
    },
  },
  {
    id: "qwen",
    label: "Qwen-Kyle",
    model: "qwen/qwen3-235b-a22b-2507",
    matchers: ["qwen", "qwen-kyle", "qwen-duchess", "qwen/qwen3-235b-a22b-2507"],
    face: {
      src: "assets/bot-faces/qwen.png",
      previewUrl: "/api/assets/bot-faces/qwen.png",
    },
    voice: {
      voice: "ash",
      instructions:
        "Voice: serious, precise, and a little theatrical. Let the last clause land with extra weight.",
    },
  },
  {
    id: "deepseek",
    label: "DeepSeek-Hank",
    model: "deepseek/deepseek-v4-flash",
    matchers: ["deepseek", "deepseek-hank", "deepseek-nex", "deepseek/deepseek-v4-flash"],
    face: {
      src: "assets/bot-faces/deepseek.png",
      previewUrl: "/api/assets/bot-faces/deepseek.png",
    },
    voice: {
      voice: "cedar",
      instructions:
        "Voice: deep, commanding, and dramatic. Treat the line like a prophecy delivered at the end of a match.",
    },
  },
  {
    id: "gemini",
    label: "Gemini-Elwin",
    model: "google/gemini-2.5-flash-lite",
    matchers: ["gemini", "gemini-elwin", "gemini-wisp", "google/gemini-2.5-flash-lite"],
    face: {
      src: "assets/bot-faces/gemini.png",
      previewUrl: "/api/assets/bot-faces/gemini.png",
    },
    voice: {
      voice: "fable",
      instructions: "Voice: thoughtful, wry, and narrator-like. Make the logic sound weirdly reasonable.",
    },
  },
  {
    id: "ling",
    label: "Ling-Wei",
    model: "inclusionai/ling-2.6-flash",
    matchers: ["ling", "ling-wei", "ling-flash", "inclusionai/ling-2.6-flash"],
    face: {
      src: "assets/bot-faces/ling.png",
      previewUrl: "/api/assets/bot-faces/ling.png",
    },
    voice: {
      voice: "verse",
      instructions: "Voice: energetic, clipped, and competitive. Keep it punchy and direct.",
    },
  },
  {
    id: "ring",
    label: "Ring-Ding",
    model: "inclusionai/ring-2.6-1t",
    matchers: ["ring", "ring-ding", "inclusionai/ring-2.6-1t"],
    face: {
      src: "assets/bot-faces/ring.png",
      previewUrl: "/api/assets/bot-faces/ring.png",
    },
    voice: {
      voice: "ballad",
      instructions: "Voice: resonant, formal, and dead serious. Add a tiny pause before the final sentence.",
    },
  },
  {
    id: "grok",
    label: "Grok-Viper",
    model: "x-ai/grok-4.1-fast",
    matchers: ["grok", "grok-viper", "x-ai/grok-4.1-fast"],
    voice: {
      voice: "marin",
      instructions: "Voice: sharp, dry, and fast. Keep it confident and a little chaotic without losing clarity.",
    },
  },
  {
    id: "seed",
    label: "Seed-Phantom",
    model: "bytedance-seed/seed-1.6-flash",
    matchers: ["seed", "seed-phantom", "bytedance-seed/seed-1.6-flash"],
    voice: {
      voice: "sage",
      instructions: "Voice: quick, cool, and tactical. Make short lines feel like decisive match calls.",
    },
  },
  {
    id: "hy3",
    label: "Hy3-Maovin",
    model: "tencent/hy3-preview",
    matchers: ["hy3", "hy3-maovin", "tencent/hy3-preview"],
    voice: {
      voice: "shimmer",
      instructions: "Voice: bright, agile, and slightly mysterious. Keep the read clean and playful.",
    },
  },
];

export function personaForSpeaker(speaker?: string): ModelPersona | undefined {
  const normalized = speaker?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (NARRATOR_PERSONA.matchers.some((matcher) => normalized.includes(matcher))) {
    return NARRATOR_PERSONA;
  }
  return MODEL_PERSONAS.find((persona) =>
    persona.matchers.some((matcher) => normalized.includes(matcher)),
  );
}

export function modelIdForSpeaker(speaker?: string): string | undefined {
  return personaForSpeaker(speaker)?.model;
}

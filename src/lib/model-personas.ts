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
    label: "Mimo-Flash",
    matchers: ["mimo", "mimo-flash"],
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
    label: "MiniMax",
    matchers: ["minimax", "mini-max"],
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
    label: "Qwen-Duchess",
    matchers: ["qwen", "qwen-duchess"],
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
    label: "DeepSeek-Nex",
    matchers: ["deepseek", "deepseek-nex"],
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
    label: "Gemini-Wisp",
    matchers: ["gemini", "gemini-wisp"],
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
    label: "Ling-Flash",
    matchers: ["ling", "ling-flash"],
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
    label: "Ring",
    matchers: ["ring"],
    face: {
      src: "assets/bot-faces/ring.png",
      previewUrl: "/api/assets/bot-faces/ring.png",
    },
    voice: {
      voice: "ballad",
      instructions: "Voice: resonant, formal, and dead serious. Add a tiny pause before the final sentence.",
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

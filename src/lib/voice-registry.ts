export const OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type OpenAiVoice = (typeof OPENAI_VOICES)[number];

export type VoiceProfile = {
  speaker: string;
  voice: OpenAiVoice;
  instructions: string;
};

const fallbackInstructions =
  "Read like a sharp short-form narrator. Keep it crisp, playful, and clear without caricature or accents.";

const MODEL_VOICE_PROFILES: Array<{
  matchers: string[];
  voice: OpenAiVoice;
  instructions: string;
}> = [
  {
    matchers: ["mimo"],
    voice: "onyx",
    instructions: "Voice: low, dry, and mischievous. Delivery should feel like a confident strategist revealing a bad idea with total certainty.",
  },
  {
    matchers: ["minimax", "mini-max"],
    voice: "echo",
    instructions: "Voice: controlled, smooth, and slightly smug. Keep the read compact and self-assured.",
  },
  {
    matchers: ["qwen"],
    voice: "ash",
    instructions: "Voice: serious, precise, and a little theatrical. Let the last clause land with extra weight.",
  },
  {
    matchers: ["deepseek"],
    voice: "cedar",
    instructions: "Voice: deep, commanding, and dramatic. Treat the line like a prophecy delivered at the end of a match.",
  },
  {
    matchers: ["gemini"],
    voice: "fable",
    instructions: "Voice: thoughtful, wry, and narrator-like. Make the logic sound weirdly reasonable.",
  },
  {
    matchers: ["ling"],
    voice: "verse",
    instructions: "Voice: energetic, clipped, and competitive. Keep it punchy and direct.",
  },
  {
    matchers: ["ring"],
    voice: "ballad",
    instructions: "Voice: resonant, formal, and dead serious. Add a tiny pause before the final sentence.",
  },
];

export const DEFAULT_TTS_INSTRUCTIONS = [
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

export function voiceForSpeaker(speaker?: string): VoiceProfile {
  const normalized = speaker?.trim() || "Narrator";
  const known = knownProfileForSpeaker(normalized);
  if (known) {
    return {
      speaker: normalized,
      voice: known.voice,
      instructions: `${DEFAULT_TTS_INSTRUCTIONS}\n\n${known.instructions} Speaker identity: ${normalized}.`,
    };
  }
  const hash = stableHash(normalized);
  const voice = OPENAI_VOICES[hash % OPENAI_VOICES.length];
  return {
    speaker: normalized,
    voice,
    instructions: `${DEFAULT_TTS_INSTRUCTIONS}\n\n${fallbackInstructions} Speaker identity: ${normalized}.`,
  };
}

function knownProfileForSpeaker(speaker: string) {
  const normalized = speaker.toLowerCase();
  return MODEL_VOICE_PROFILES.find((profile) =>
    profile.matchers.some((matcher) => normalized.includes(matcher)),
  );
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

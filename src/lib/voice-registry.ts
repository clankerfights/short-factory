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
  const hash = stableHash(normalized);
  const voice = OPENAI_VOICES[hash % OPENAI_VOICES.length];
  return {
    speaker: normalized,
    voice,
    instructions: `${DEFAULT_TTS_INSTRUCTIONS}\n\n${fallbackInstructions} Speaker identity: ${normalized}.`,
  };
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

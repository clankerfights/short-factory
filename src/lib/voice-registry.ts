import {
  DEFAULT_TIKTOK_VOICE_INSTRUCTIONS,
  NARRATOR_PERSONA,
  personaForSpeaker,
} from "./model-personas";
import { OPENAI_VOICES, type OpenAiVoice } from "./voice-options";

export { OPENAI_VOICES };
export type { OpenAiVoice };

export type VoiceProfile = {
  speaker: string;
  voice: OpenAiVoice;
  instructions: string;
};

const fallbackInstructions =
  "Read like a sharp short-form narrator. Keep it crisp, playful, and clear without caricature or accents.";

export const DEFAULT_TTS_INSTRUCTIONS = DEFAULT_TIKTOK_VOICE_INSTRUCTIONS;

export function voiceForSpeaker(speaker?: string): VoiceProfile {
  const normalized = speaker?.trim() || NARRATOR_PERSONA.label;
  const persona = personaForSpeaker(normalized);
  if (persona) {
    return {
      speaker: normalized,
      voice: persona.voice.voice,
      instructions: `${DEFAULT_TIKTOK_VOICE_INSTRUCTIONS}\n\n${persona.voice.instructions} Speaker identity: ${normalized}.`,
    };
  }

  const voice = OPENAI_VOICES[stableHash(normalized) % OPENAI_VOICES.length] ?? "coral";
  return {
    speaker: normalized,
    voice,
    instructions: `${DEFAULT_TIKTOK_VOICE_INSTRUCTIONS}\n\n${fallbackInstructions} Speaker identity: ${normalized}.`,
  };
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

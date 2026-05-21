import { createOpenAiClient } from "./openai-client";

const DEFAULT_VOICE_PROMPT_MODEL = "gpt-5.5";

export async function generateFinalMessageVoiceInstructions(args: {
  tone: string | undefined;
  speaker: string;
  text: string;
  game: string;
}): Promise<string | undefined> {
  const tone = args.tone?.trim();
  if (!tone) return undefined;

  const client = createOpenAiClient();
  const response = await client.responses.create({
    model: process.env.OPENAI_TONE_MODEL ?? DEFAULT_VOICE_PROMPT_MODEL,
    instructions:
      "You convert a user's rough tone note into OpenAI text-to-speech voice instructions. " +
      "Return only the voice direction, not the spoken line. Use concise sections named Affect, Tone, Emotion, Pronunciation, and Pause. " +
      "Do not ask for caricatured accents, protected-class stereotypes, slurs, or nationality-based humor.",
    input: [
      `Speaker: ${args.speaker}`,
      `Game: ${args.game}`,
      `Final highlighted chat text: ${args.text}`,
      `User tone note: ${tone}`,
    ].join("\n"),
    max_output_tokens: 260,
  });

  const text = response.output_text.trim();
  return text.length > 0 ? text : fallbackVoiceInstructions(tone);
}

function fallbackVoiceInstructions(tone: string): string {
  return [
    `Affect: ${tone}`,
    "Tone: Clear, intentional, and short-form dramatic without sounding like a parody.",
    "Emotion: Match the intensity of the line while keeping the delivery grounded.",
    "Pronunciation: Crisp and deliberate.",
    "Pause: Add a small pause before the final phrase if it improves the punchline.",
  ].join("\n\n");
}

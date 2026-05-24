import { createOpenAiClient } from "./openai-client";

export type GenerateSpeechOptions = {
  text: string;
  voice: string;
  instructions?: string;
};

export async function generateOpenAiSpeech(
  options: GenerateSpeechOptions,
): Promise<Buffer> {
  const client = createOpenAiClient();
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: options.voice,
    input: options.text,
    instructions: options.instructions,
    response_format: "mp3",
  });

  return Buffer.from(await response.arrayBuffer());
}

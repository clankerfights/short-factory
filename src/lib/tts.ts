import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

export type GenerateSpeechOptions = {
  text: string;
  voice: string;
  instructions?: string;
};

export async function generateOpenAiSpeech(
  options: GenerateSpeechOptions,
): Promise<Buffer> {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate TTS.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: options.voice,
    input: options.text,
    instructions: options.instructions,
    response_format: "mp3",
  });

  return Buffer.from(await response.arrayBuffer());
}

function resolveOpenAiApiKey(): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  try {
    const envPath = path.join(process.cwd(), ".env");
    const env = readFileSync(envPath, "utf8");
    const match = env.match(/^OPENAI_API_KEY=(.+)$/m);
    return match?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

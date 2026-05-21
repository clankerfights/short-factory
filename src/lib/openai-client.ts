import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

export function createOpenAiClient(): OpenAI {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI requests.");
  }

  return new OpenAI({ apiKey });
}

export function resolveOpenAiApiKey(): string | undefined {
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

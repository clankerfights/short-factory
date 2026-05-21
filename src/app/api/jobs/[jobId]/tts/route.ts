import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  compositionForVariant,
  upsertCompositionLayer,
  applyCompositionToJob,
} from "../../../../../lib/composition-utils";
import { jobDirectory, readFactoryJob, saveFactoryJob } from "../../../../../lib/job-store";
import { ttsRequestSchema } from "../../../../../lib/schemas";
import { generateOpenAiSpeech } from "../../../../../lib/tts";
import { voiceForSpeaker } from "../../../../../lib/voice-registry";
import type { TtsLayer } from "../../../../../lib/edit-model";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const body = ttsRequestSchema.parse(await request.json());
    const job = await readFactoryJob(jobId);
    const variant = job.editRecipe.variants.find(
      (candidate) => candidate.variantId === body.variantId,
    );
    if (!variant) throw new Error(`No edit recipe variant found for ${body.variantId}.`);

    const profile = voiceForSpeaker(body.speaker ?? variant.speaker);
    const voice = body.voice ?? profile.voice;
    const instructions = body.instructions ?? profile.instructions;
    const audio = await generateOpenAiSpeech({
      text: body.text,
      voice,
      instructions,
    });

    const relativePath = path.join("assets", "tts", `${safeFileName(body.layerId)}.mp3`);
    const absolutePath = path.join(jobDirectory(job.id), relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, audio);

    const composition = compositionForVariant(variant);
    const previous = composition.layers.find(
      (layer): layer is TtsLayer => layer.id === body.layerId && layer.kind === "tts",
    );
    const start = body.start ?? previous?.time.start ?? 0;
    const layer: TtsLayer = {
      id: body.layerId,
      kind: "tts",
      name: previous?.name ?? "TTS",
      time: {
        start,
        duration: body.duration ?? previous?.time.duration ?? 120,
      },
      zIndex: previous?.zIndex ?? 100,
      text: body.text,
      speaker: body.speaker ?? variant.speaker,
      voice,
      instructions,
      src: relativePath.replaceAll("\\", "/"),
      artifactPath: absolutePath,
      volume: body.volume,
    };

    const nextComposition = upsertCompositionLayer(composition, layer);
    applyCompositionToJob(job, body.variantId, nextComposition);
    await saveFactoryJob(job);
    return NextResponse.json({ job, layer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]/gi, "_").slice(0, 80) || "tts";
}

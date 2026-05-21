import { NextResponse } from "next/server";
import { fetchClipDetail } from "../../../lib/clankerfights";
import { createFactoryJob, listFactoryJobs } from "../../../lib/job-store";
import { normalizeClipDetailToQuoteJob } from "../../../lib/normalize-clip";
import { generateEditRecipe } from "../../../lib/recipe-generator";
import { createJobRequestSchema } from "../../../lib/schemas";
import { resolveAutomaticTemplateId } from "../../../lib/template-registry";
import { generateFinalMessageVoiceInstructions } from "../../../lib/voice-description";

export const runtime = "nodejs";

export async function GET() {
  try {
    const jobs = await listFactoryJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = createJobRequestSchema.parse(await request.json());
    const { detail, source } = await fetchClipDetail(body.clipUrl);
    const selectedTemplateId = resolveAutomaticTemplateId(body.templateId);
    const provisionalQuoteJob = normalizeClipDetailToQuoteJob({
      detail,
      source,
      hookText: body.hookText,
      toneHint: body.toneHint ?? body.finalMessageTone,
      finalMessageTone: body.finalMessageTone,
      selectedTemplateId,
      clipPlaybackSpeed: body.clipPlaybackSpeed ?? 2,
    });
    const finalMessage =
      provisionalQuoteJob.highlightedMessages[
        provisionalQuoteJob.highlightedMessages.length - 1
      ];
    const finalMessageVoiceInstructions = finalMessage
      ? await generateFinalMessageVoiceInstructions({
          tone: body.finalMessageTone,
          speaker: finalMessage.speaker,
          text: finalMessage.text,
          game: provisionalQuoteJob.game,
        })
      : undefined;
    const quoteJob = finalMessageVoiceInstructions
      ? { ...provisionalQuoteJob, finalMessageVoiceInstructions }
      : provisionalQuoteJob;
    const editRecipe = generateEditRecipe(quoteJob);
    const job = await createFactoryJob({ quoteJob, editRecipe });

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}

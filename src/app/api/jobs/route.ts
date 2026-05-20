import { NextResponse } from "next/server";
import { fetchClipDetail } from "../../../lib/clankerfights";
import { createFactoryJob } from "../../../lib/job-store";
import { normalizeClipDetailToQuoteJob } from "../../../lib/normalize-clip";
import { generateEditRecipe } from "../../../lib/recipe-generator";
import { createJobRequestSchema } from "../../../lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = createJobRequestSchema.parse(await request.json());
    const { detail, source } = await fetchClipDetail(body.clipUrl);
    const quoteJob = normalizeClipDetailToQuoteJob({
      detail,
      source,
      toneHint: body.toneHint,
    });
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

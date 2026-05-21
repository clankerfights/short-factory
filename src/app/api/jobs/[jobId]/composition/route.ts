import { NextResponse } from "next/server";
import { applyCompositionToJob } from "../../../../../lib/composition-utils";
import { readFactoryJob, saveFactoryJob } from "../../../../../lib/job-store";
import { updateCompositionRequestSchema } from "../../../../../lib/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const body = updateCompositionRequestSchema.parse(await request.json());
    const job = await readFactoryJob(jobId);
    applyCompositionToJob(job, body.variantId, body.composition);
    await saveFactoryJob(job);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}

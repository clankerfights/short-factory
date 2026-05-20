import { NextResponse } from "next/server";
import { readFactoryJob, saveFactoryJob } from "../../../../../lib/job-store";
import { runNpmScript } from "../../../../../lib/run-script";
import { renderJobRequestSchema } from "../../../../../lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const job = await readFactoryJob(jobId);

  try {
    const body = renderJobRequestSchema.parse(await optionalJson(request));
    if (!job.artifacts.baseRecordingPath) {
      throw new Error("Record the base clip before rendering a recipe variant.");
    }

    await runNpmScript("render:recipe", [
      "--job-id",
      job.id,
      "--variant",
      body.variantId,
    ]);

    return NextResponse.json({ job: await readFactoryJob(job.id) });
  } catch (error) {
    job.status.render = "failed";
    job.artifacts.error = error instanceof Error ? error.message : "Unknown error";
    await saveFactoryJob(job);
    return NextResponse.json({ error: job.artifacts.error, job }, { status: 500 });
  }
}

async function optionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

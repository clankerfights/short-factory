import { NextResponse } from "next/server";
import { readFactoryJob, saveFactoryJob } from "../../../../../lib/job-store";
import { runNpmScript } from "../../../../../lib/run-script";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const job = await readFactoryJob(jobId);

  try {
    if (!job.artifacts.baseRecordingPath) {
      throw new Error("Record the base clip before rendering the raw MP4.");
    }

    await runNpmScript("render:raw", ["--job-id", job.id]);
    return NextResponse.json({ job: await readFactoryJob(job.id) });
  } catch (error) {
    job.artifacts.error = error instanceof Error ? error.message : "Unknown error";
    await saveFactoryJob(job);
    return NextResponse.json({ error: job.artifacts.error, job }, { status: 500 });
  }
}

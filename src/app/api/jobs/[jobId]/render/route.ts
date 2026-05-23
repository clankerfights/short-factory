import { promises as fs } from "node:fs";
import path from "node:path";
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

    const renderedJob = await readFactoryJob(job.id);
    let savedTo: string | undefined;
    if (body.saveAsPath) {
      savedTo = await copyRenderedMp4(renderedJob.artifacts.renderedVideoPath, body.saveAsPath);
    }

    return NextResponse.json({ job: renderedJob, savedTo });
  } catch (error) {
    job.status.render = "failed";
    job.artifacts.error = error instanceof Error ? error.message : "Unknown error";
    await saveFactoryJob(job);
    return NextResponse.json({ error: job.artifacts.error, job }, { status: 500 });
  }
}

async function copyRenderedMp4(
  renderedVideoPath: string | undefined,
  saveAsPath: string,
): Promise<string> {
  if (!renderedVideoPath) throw new Error("Render finished without an MP4 artifact.");
  const outputPath = path.resolve(saveAsPath);
  if (path.extname(outputPath).toLowerCase() !== ".mp4") {
    throw new Error("Choose an .mp4 output path.");
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.copyFile(renderedVideoPath, outputPath);
  return outputPath;
}

async function optionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

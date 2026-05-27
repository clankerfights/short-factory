import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  FactoryPipelineError,
  renderRecipeFactoryJob,
} from "../../../../../lib/factory-pipeline";
import { renderJobRequestSchema } from "../../../../../lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const body = renderJobRequestSchema.parse(await optionalJson(request));
    const renderedJob = await renderRecipeFactoryJob(jobId, {
      variantId: body.variantId,
    });
    let savedTo: string | undefined;
    if (body.saveAsPath) {
      savedTo = await copyRenderedMp4(renderedJob.artifacts.renderedVideoPath, body.saveAsPath);
    }

    return NextResponse.json({ job: renderedJob, savedTo });
  } catch (error) {
    const job = error instanceof FactoryPipelineError ? error.job : undefined;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        job,
      },
      { status: 500 },
    );
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

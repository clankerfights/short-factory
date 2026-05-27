import { NextResponse } from "next/server";
import {
  FactoryPipelineError,
  recordFactoryJob,
} from "../../../../../lib/factory-pipeline";
import { recordJobRequestSchema } from "../../../../../lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const body = recordJobRequestSchema.parse(await optionalJson(request));
    const job = await recordFactoryJob(jobId, {
      durationSeconds: body.durationSeconds,
    });
    return NextResponse.json({ job });
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

async function optionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

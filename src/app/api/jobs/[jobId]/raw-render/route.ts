import { NextResponse } from "next/server";
import {
  FactoryPipelineError,
  renderRawFactoryJob,
} from "../../../../../lib/factory-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const job = await renderRawFactoryJob(jobId);
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

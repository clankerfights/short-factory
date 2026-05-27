import { NextResponse } from "next/server";
import {
  FactoryPipelineError,
  runFactoryWorkflow,
} from "../../../../../../lib/factory-pipeline";
import {
  buildFactoryVideoResponse,
  FACTORY_API_VERSION,
} from "../../../../../../lib/factory-api";
import { factoryVideoRunWorkflowRequestSchema } from "../../../../../../lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const workflow = factoryVideoRunWorkflowRequestSchema.parse(await optionalJson(request));
    const job = await runFactoryWorkflow(jobId, workflow);
    return NextResponse.json(buildFactoryVideoResponse(request, job));
  } catch (error) {
    const failedJob = error instanceof FactoryPipelineError ? error.job : undefined;
    return NextResponse.json(
      {
        apiVersion: FACTORY_API_VERSION,
        error: error instanceof Error ? error.message : "Unknown error",
        ...(failedJob ? { video: buildFactoryVideoResponse(request, failedJob) } : {}),
      },
      { status: error instanceof FactoryPipelineError ? 500 : 400 },
    );
  }
}

async function optionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

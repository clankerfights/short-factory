import { NextResponse } from "next/server";
import {
  createFactoryJobFromClip,
  FactoryPipelineError,
  runFactoryWorkflow,
} from "../../../../lib/factory-pipeline";
import {
  buildFactoryVideoListResponse,
  buildFactoryVideoResponse,
  FACTORY_API_VERSION,
} from "../../../../lib/factory-api";
import { listFactoryJobs } from "../../../../lib/job-store";
import { factoryVideoCreateRequestSchema } from "../../../../lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET(request: Request) {
  try {
    const jobs = await listFactoryJobs(50);
    return NextResponse.json(buildFactoryVideoListResponse(request, jobs));
  } catch (error) {
    return NextResponse.json(
      {
        apiVersion: FACTORY_API_VERSION,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = factoryVideoCreateRequestSchema.parse(await request.json());
    const { workflow, ...createJobInput } = body;
    const job = await createFactoryJobFromClip(createJobInput);
    const finishedJob = await runFactoryWorkflow(job, workflow);

    return NextResponse.json(buildFactoryVideoResponse(request, finishedJob), {
      status: 201,
    });
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

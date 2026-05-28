import { NextResponse } from "next/server";
import {
  ClankerfightsApiError,
  clankerfightsCallerStatus,
} from "../../../../lib/clankerfights";
import {
  createFactoryJobForVideo,
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
    const job = await createFactoryJobForVideo(body);
    const finishedJob = await runFactoryWorkflow(job, body.workflow);

    return NextResponse.json(buildFactoryVideoResponse(request, finishedJob), {
      status: 201,
    });
  } catch (error) {
    const failedJob = error instanceof FactoryPipelineError ? error.job : undefined;
    const status =
      error instanceof FactoryPipelineError
        ? 500
        : error instanceof ClankerfightsApiError
          ? clankerfightsCallerStatus(error)
          : 400;
    return NextResponse.json(
      {
        apiVersion: FACTORY_API_VERSION,
        error: error instanceof Error ? error.message : "Unknown error",
        ...(failedJob ? { video: buildFactoryVideoResponse(request, failedJob) } : {}),
      },
      { status },
    );
  }
}

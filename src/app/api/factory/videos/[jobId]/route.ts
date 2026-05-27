import { NextResponse } from "next/server";
import {
  buildFactoryVideoResponse,
  FACTORY_API_VERSION,
} from "../../../../../lib/factory-api";
import { readFactoryJob } from "../../../../../lib/job-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const job = await readFactoryJob(jobId);
    return NextResponse.json(buildFactoryVideoResponse(request, job));
  } catch (error) {
    return NextResponse.json(
      {
        apiVersion: FACTORY_API_VERSION,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 404 },
    );
  }
}

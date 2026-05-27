import { NextResponse } from "next/server";
import { createFactoryJobFromClip } from "../../../lib/factory-pipeline";
import { listFactoryJobs } from "../../../lib/job-store";
import { createJobRequestSchema } from "../../../lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const jobs = await listFactoryJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = createJobRequestSchema.parse(await request.json());
    const job = await createFactoryJobFromClip(body);

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}

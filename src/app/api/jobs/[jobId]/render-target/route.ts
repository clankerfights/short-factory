import { NextResponse } from "next/server";
import { pickMp4SavePath } from "../../../../../lib/save-dialog";
import { renderTargetRequestSchema } from "../../../../../lib/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const body = renderTargetRequestSchema.parse(await optionalJson(request));
    const selectedPath = await pickMp4SavePath(
      body.suggestedName || `${jobId}-v1.mp4`,
    );
    return NextResponse.json({ selectedPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not choose save location." },
      { status: 500 },
    );
  }
}

async function optionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

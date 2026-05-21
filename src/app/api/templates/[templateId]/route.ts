import { NextResponse } from "next/server";
import { updateTemplateRequestSchema } from "../../../../lib/schemas";
import { readTemplate, updateTemplate } from "../../../../lib/template-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await context.params;
    const template = await readTemplate(templateId);
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 404 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await context.params;
    const body = updateTemplateRequestSchema.parse(await request.json());
    const template = await updateTemplate(templateId, body);
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}

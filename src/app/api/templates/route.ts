import { NextResponse } from "next/server";
import {
  createTemplateRequestSchema,
} from "../../../lib/schemas";
import { createTemplate, listTemplates } from "../../../lib/template-store";
import { listBuiltInTemplates } from "../../../lib/template-registry";

export const runtime = "nodejs";

export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({
    templates,
    builtInTemplates: listBuiltInTemplates(),
  });
}

export async function POST(request: Request) {
  try {
    const body = createTemplateRequestSchema.parse(await request.json());
    const template = await createTemplate({
      name: body.name,
      description: body.description,
      tags: body.tags,
      thumbnailPath: body.thumbnailPath,
      composition: body.composition,
    });
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}

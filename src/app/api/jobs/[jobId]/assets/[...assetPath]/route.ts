import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { jobDirectory } from "../../../../../../lib/job-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; assetPath: string[] }> },
) {
  try {
    const { jobId, assetPath } = await context.params;
    const root = path.resolve(jobDirectory(jobId));
    const absolutePath = path.resolve(root, assetPath.join(path.sep));
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid job asset path.");
    }

    const file = await fs.readFile(absolutePath);
    return new Response(file, {
      headers: {
        "content-type": contentType(absolutePath),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Asset not found." },
      { status: 404 },
    );
  }
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".json") return "application/json";
  return "application/octet-stream";
}

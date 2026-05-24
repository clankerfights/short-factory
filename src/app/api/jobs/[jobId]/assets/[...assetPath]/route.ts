import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { jobDirectory } from "../../../../../../lib/job-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
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
    const type = contentType(absolutePath);
    const range = parseRange(request.headers.get("range"), file.length);
    if (range) {
      const chunk = file.subarray(range.start, range.end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          "accept-ranges": "bytes",
          "content-length": String(chunk.length),
          "content-range": `bytes ${range.start}-${range.end}/${file.length}`,
          "content-type": type,
          "cache-control": "no-store",
        },
      });
    }

    return new Response(file, {
      headers: {
        "accept-ranges": "bytes",
        "content-length": String(file.length),
        "content-type": type,
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

function parseRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!value?.startsWith("bytes=") || size <= 0) return null;
  const [rawStart, rawEnd] = value.slice("bytes=".length).split("-", 2);
  const start = rawStart ? Number.parseInt(rawStart, 10) : 0;
  const end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
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

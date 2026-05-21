import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ASSETS_DIR = path.join(process.cwd(), "assets");
const ASSETS_ROOT = path.resolve(ASSETS_DIR);

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetPath: string[] }> },
) {
  try {
    const { assetPath } = await context.params;
    const safePath = assetPath.join(path.sep);
    const absolutePath = path.resolve(ASSETS_ROOT, safePath);
    if (
      absolutePath !== ASSETS_ROOT &&
      !absolutePath.startsWith(`${ASSETS_ROOT}${path.sep}`)
    ) {
      throw new Error("Invalid asset path.");
    }

    const file = await fs.readFile(absolutePath);
    return new Response(file, {
      headers: {
        "content-type": contentType(absolutePath),
        "cache-control": "public, max-age=300",
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
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

import { NextResponse } from "next/server";
import { fetchWatchArchive } from "../../../../../lib/clankerfights";
import { FACTORY_API_VERSION } from "../../../../../lib/factory-api";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const archive = await fetchWatchArchive(url.searchParams);
    return NextResponse.json(archive);
  } catch (error) {
    return NextResponse.json(
      {
        apiVersion: FACTORY_API_VERSION,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}

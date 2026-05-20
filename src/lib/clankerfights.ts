import { normalizeClipInput } from "./clip-url";
import type { ClipDetailWire } from "./types";

export async function fetchClipDetail(clipUrlOrId: string): Promise<{
  detail: ClipDetailWire;
  source: ReturnType<typeof normalizeClipInput>;
}> {
  const source = normalizeClipInput(clipUrlOrId);
  const headers: HeadersInit = {
    accept: "application/json",
  };

  if (process.env.CLANKERFIGHTS_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.CLANKERFIGHTS_API_TOKEN}`;
  }

  const response = await fetch(source.apiUrl, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Clankerfights API returned ${response.status} for clip ${source.clipId}.`,
    );
  }

  return {
    detail: (await response.json()) as ClipDetailWire,
    source,
  };
}

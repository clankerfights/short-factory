import { normalizeClipInput } from "./clip-url";
import { parseClipFactoryPacketWire } from "./schemas";
import type { ClipDetailWire, ClipFactoryPacketWire } from "./types";

export async function fetchClipDetail(clipUrlOrId: string): Promise<{
  detail: ClipDetailWire;
  source: ReturnType<typeof normalizeClipInput>;
}> {
  const source = normalizeClipInput(clipUrlOrId);
  const response = await fetch(source.apiUrl, {
    headers: clankerfightsHeaders(),
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

export async function fetchClipFactoryPacket(clipUrlOrId: string): Promise<{
  packet: ClipFactoryPacketWire;
  source: ReturnType<typeof normalizeClipInput>;
}> {
  const source = normalizeClipInput(clipUrlOrId);
  const response = await fetch(source.factoryPacketUrl, {
    headers: clankerfightsHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Clankerfights factory packet returned ${response.status} for clip ${source.clipId}. Update Clankerfights or highlight a valid clip first.`,
    );
  }

  return {
    packet: parseClipFactoryPacketWire(await response.json()),
    source,
  };
}

function clankerfightsHeaders(): HeadersInit {
  const headers: HeadersInit = {
    accept: "application/json",
  };

  if (process.env.CLANKERFIGHTS_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.CLANKERFIGHTS_API_TOKEN}`;
  }

  return headers;
}

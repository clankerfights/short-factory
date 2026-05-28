import { clankerfightsBaseUrl, normalizeClipInput } from "./clip-url";
import {
  internalAutomatedClipResultSchema,
  parseClipFactoryPacketWire,
} from "./schemas";
import type {
  ClipDetailWire,
  ClipFactoryPacketWire,
  InternalAutomatedClipRequest,
  InternalAutomatedClipResult,
} from "./types";

type FetchLike = typeof fetch;
type QueryValue = string | number | boolean | null | undefined;
type WatchArchiveQueryInput =
  | URLSearchParams
  | Iterable<readonly [string, string]>
  | Record<string, QueryValue>;

export class ClankerfightsApiError extends Error {
  readonly status: number;
  readonly resource: string;

  constructor(resource: string, status: number, detail: string) {
    const suffix = detail.trim() ? `: ${detail.trim().slice(0, 500)}` : "";
    super(`Clankerfights ${resource} returned ${status}${suffix}`);
    this.name = "ClankerfightsApiError";
    this.status = status;
    this.resource = resource;
  }
}

export async function fetchClipDetail(
  clipUrlOrId: string,
  options: { fetchFn?: FetchLike } = {},
): Promise<{
  detail: ClipDetailWire;
  source: ReturnType<typeof normalizeClipInput>;
}> {
  const source = normalizeClipInput(clipUrlOrId);
  const response = await (options.fetchFn ?? fetch)(source.apiUrl, {
    headers: clankerfightsHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw await clankerfightsError(response, `clip ${source.clipId}`);
  }

  return {
    detail: (await response.json()) as ClipDetailWire,
    source,
  };
}

export async function fetchClipFactoryPacket(
  clipUrlOrId: string,
  options: { fetchFn?: FetchLike } = {},
): Promise<{
  packet: ClipFactoryPacketWire;
  source: ReturnType<typeof normalizeClipInput>;
}> {
  const source = normalizeClipInput(clipUrlOrId);
  const response = await (options.fetchFn ?? fetch)(source.factoryPacketUrl, {
    headers: clankerfightsHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw await clankerfightsError(
      response,
      `factory packet for clip ${source.clipId}`,
    );
  }

  return {
    packet: parseClipFactoryPacketWire(await response.json()),
    source,
  };
}

export function buildWatchArchiveUrl(
  query: WatchArchiveQueryInput,
  baseUrl = clankerfightsBaseUrl(),
): string {
  const url = new URL("/api/watch/archive", baseUrl);
  for (const [key, value] of queryEntries(query)) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

export async function fetchWatchArchive(
  query: WatchArchiveQueryInput,
  options: { fetchFn?: FetchLike } = {},
): Promise<unknown> {
  const response = await (options.fetchFn ?? fetch)(buildWatchArchiveUrl(query), {
    headers: clankerfightsHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw await clankerfightsError(response, "watch archive");
  }

  return response.json();
}

export async function createAutomatedClipFromSelection(
  request: InternalAutomatedClipRequest,
  options: { fetchFn?: FetchLike } = {},
): Promise<InternalAutomatedClipResult> {
  const response = await (options.fetchFn ?? fetch)(
    new URL("/internal/clips/automated", clankerfightsBaseUrl()),
    {
      method: "POST",
      headers: clankerfightsJsonHeaders(),
      body: JSON.stringify(request),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw await clankerfightsError(response, "automated clip");
  }

  return internalAutomatedClipResultSchema.parse(await response.json());
}

export function clankerfightsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (process.env.CLANKERFIGHTS_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.CLANKERFIGHTS_API_TOKEN}`;
  }

  const internalSecret =
    process.env.CLANKERFIGHTS_ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  if (internalSecret) {
    headers["x-internal-secret"] = internalSecret;
  }

  return headers;
}

export function clankerfightsCallerStatus(error: ClankerfightsApiError): number {
  if (error.status >= 400 && error.status < 500) {
    return error.status === 401 || error.status === 403 ? 502 : error.status;
  }
  return 502;
}

function clankerfightsJsonHeaders(): Record<string, string> {
  return {
    ...clankerfightsHeaders(),
    "content-type": "application/json",
  };
}

function queryEntries(
  query: WatchArchiveQueryInput,
): Iterable<readonly [string, QueryValue]> {
  if (query instanceof URLSearchParams) return query.entries();
  if (Symbol.iterator in query) return query;
  return Object.entries(query);
}

async function clankerfightsError(
  response: Response,
  resource: string,
): Promise<ClankerfightsApiError> {
  const detail = await response.text();
  return new ClankerfightsApiError(resource, response.status, detail);
}

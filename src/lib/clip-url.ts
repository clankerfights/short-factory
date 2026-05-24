import {
  DEFAULT_CHAT_HEIGHT_PCT,
  DEFAULT_REPLAY_LAYOUT_WIDTH,
  PHONE_CAPTURE_VIEWPORT,
} from "./capture-plan";

const CLIP_ID_RE = /^[a-zA-Z0-9_-]{4,}$/;

export function clankerfightsBaseUrl(): string {
  return process.env.CLANKERFIGHTS_BASE_URL ?? "https://clankerfights.ai";
}

export function normalizeClipInput(input: string, baseUrl = clankerfightsBaseUrl()) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Clip URL is required.");
  }

  const clipId = extractClipId(trimmed);
  const base = resolveClipBaseUrl(trimmed, baseUrl);
  const clipUrl = new URL(`/clip/${clipId}`, base);
  const playbackUrl = new URL("/", base);
  playbackUrl.searchParams.set("clip", clipId);
  playbackUrl.searchParams.set("factory", "1");
  playbackUrl.searchParams.set("layoutWidth", String(DEFAULT_REPLAY_LAYOUT_WIDTH));
  playbackUrl.searchParams.set(
    "viewport",
    `${PHONE_CAPTURE_VIEWPORT.width}x${PHONE_CAPTURE_VIEWPORT.height}`,
  );
  playbackUrl.searchParams.set("chatHeightPct", String(DEFAULT_CHAT_HEIGHT_PCT));
  playbackUrl.searchParams.set("showControls", "0");
  playbackUrl.searchParams.set("showTopChrome", "0");
  playbackUrl.searchParams.set("autoplay", "1");

  return {
    clipId,
    clipUrl: clipUrl.toString(),
    playbackUrl: playbackUrl.toString(),
    apiUrl: new URL(`/api/clips/${clipId}`, base).toString(),
    factoryPacketUrl: new URL(`/api/clips/${clipId}/factory-packet`, base).toString(),
    transcriptUrl: new URL(`/api/clips/${clipId}/transcript`, base).toString(),
    captureUrl: new URL(`/api/clips/${clipId}/capture`, base).toString(),
  };
}

function resolveClipBaseUrl(input: string, fallbackBaseUrl: string): URL {
  try {
    const url = new URL(input);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return new URL(url.origin);
    }
  } catch {
    // Bare clip IDs use the configured default base URL.
  }

  return new URL(fallbackBaseUrl);
}

function extractClipId(input: string): string {
  if (CLIP_ID_RE.test(input)) return input;

  const url = new URL(input);
  const queryClip = url.searchParams.get("clip");
  if (queryClip && CLIP_ID_RE.test(queryClip)) return queryClip;

  const parts = url.pathname.split("/").filter(Boolean);
  const clipIndex = parts.findIndex((part) => part === "clip");
  if (clipIndex >= 0 && parts[clipIndex + 1] && CLIP_ID_RE.test(parts[clipIndex + 1])) {
    return parts[clipIndex + 1];
  }

  const lastPart = parts.at(-1);
  if (lastPart && CLIP_ID_RE.test(lastPart)) return lastPart;

  throw new Error("Could not find a clip ID in that URL.");
}

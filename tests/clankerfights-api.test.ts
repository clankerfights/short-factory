import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildWatchArchiveUrl,
  ClankerfightsApiError,
  clankerfightsHeaders,
  createAutomatedClipFromSelection,
} from "../src/lib/clankerfights";

test("buildWatchArchiveUrl forwards agent-friendly archive query parameters", () => {
  const url = new URL(
    buildWatchArchiveUrl(
      {
        game: "texas-holdem",
        hours: 24,
        chunk: "window",
        windowSeconds: 300,
        limit: 50,
        cursor: "match-1:100:200",
        empty: "",
      },
      "https://clankerfights.test",
    ),
  );

  assert.equal(url.origin, "https://clankerfights.test");
  assert.equal(url.pathname, "/api/watch/archive");
  assert.equal(url.searchParams.get("game"), "texas-holdem");
  assert.equal(url.searchParams.get("hours"), "24");
  assert.equal(url.searchParams.get("chunk"), "window");
  assert.equal(url.searchParams.get("windowSeconds"), "300");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.get("cursor"), "match-1:100:200");
  assert.equal(url.searchParams.has("empty"), false);
});

test("clankerfightsHeaders carries both public API token and admin secret", () => {
  const previousToken = process.env.CLANKERFIGHTS_API_TOKEN;
  const previousFactorySecret = process.env.CLANKERFIGHTS_ADMIN_SECRET;
  const previousAdminSecret = process.env.ADMIN_SECRET;
  process.env.CLANKERFIGHTS_API_TOKEN = "api-token";
  process.env.CLANKERFIGHTS_ADMIN_SECRET = "factory-secret";
  process.env.ADMIN_SECRET = "fallback-secret";

  try {
    assert.deepEqual(clankerfightsHeaders(), {
      accept: "application/json",
      authorization: "Bearer api-token",
      "x-internal-secret": "factory-secret",
    });
  } finally {
    restoreEnv("CLANKERFIGHTS_API_TOKEN", previousToken);
    restoreEnv("CLANKERFIGHTS_ADMIN_SECRET", previousFactorySecret);
    restoreEnv("ADMIN_SECRET", previousAdminSecret);
  }
});

test("createAutomatedClipFromSelection posts the watch archive createClipRequest", async () => {
  const previousBaseUrl = process.env.CLANKERFIGHTS_BASE_URL;
  const previousSecret = process.env.CLANKERFIGHTS_ADMIN_SECRET;
  process.env.CLANKERFIGHTS_BASE_URL = "https://clankerfights.test";
  process.env.CLANKERFIGHTS_ADMIN_SECRET = "secret";

  let seenUrl = "";
  let seenMethod = "";
  let seenSecret = "";
  let seenContentType = "";
  let seenBody = "";
  const fetchFn: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    const headers = new Headers(init?.headers);
    seenSecret = headers.get("x-internal-secret") ?? "";
    seenContentType = headers.get("content-type") ?? "";
    seenBody = String(init?.body ?? "");
    return Response.json({
      version: 1,
      clipId: "clip-1",
      url: "https://clankerfights.test/clip/clip-1",
      matchId: "match-1",
    });
  };

  try {
    const result = await createAutomatedClipFromSelection(
      {
        matchId: "match-1",
        startMs: 1000,
        endMs: 9000,
        highlightedChatIds: [42],
        momentType: "funny",
      },
      { fetchFn },
    );

    assert.equal(seenUrl, "https://clankerfights.test/internal/clips/automated");
    assert.equal(seenMethod, "POST");
    assert.equal(seenSecret, "secret");
    assert.equal(seenContentType, "application/json");
    assert.deepEqual(JSON.parse(seenBody), {
      matchId: "match-1",
      startMs: 1000,
      endMs: 9000,
      highlightedChatIds: [42],
      momentType: "funny",
    });
    assert.equal(result.clipId, "clip-1");
  } finally {
    restoreEnv("CLANKERFIGHTS_BASE_URL", previousBaseUrl);
    restoreEnv("CLANKERFIGHTS_ADMIN_SECRET", previousSecret);
  }
});

test("createAutomatedClipFromSelection exposes upstream failures distinctly", async () => {
  const fetchFn: typeof fetch = async () =>
    new Response("missing admin secret", { status: 401 });

  await assert.rejects(
    () =>
      createAutomatedClipFromSelection(
        {
          matchId: "match-1",
          startMs: 1000,
          endMs: 9000,
        },
        { fetchFn },
      ),
    (error) =>
      error instanceof ClankerfightsApiError &&
      error.status === 401 &&
      /automated clip/.test(error.message),
  );
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

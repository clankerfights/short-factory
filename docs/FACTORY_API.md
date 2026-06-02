# Factory Video API

The Factory Video API is the stable, client-neutral surface for generating
short-form videos. It is suitable for coding agents, orchestration agents,
queue workers, CLI scripts, and future product surfaces.

## Design Contract

- The API consumes highlighted Clankerfights clips, not raw MP4 uploads.
- The source of truth is still `GET /api/clips/:id/factory-packet` from the
  Clankerfights origin.
- The response always returns a `factory.videoJob` envelope with status,
  variants, artifact links, and recovery links.
- Video generation is synchronous for the local MVP. Long calls can take several
  minutes because recording and Remotion rendering happen before the response.
- The route is idempotent around artifacts by default: existing recordings and
  renders are reused unless `overwrite` is true.
- Historical game/chat data remains owned by Clankerfights. Short Factory only
  forwards archive queries and turns selected archive windows into clips before
  rendering videos.

## Discover Historical Moments

Agents can call Clankerfights directly:

```text
GET https://clankerfights.ai/api/watch/archive?game=texas-holdem&hours=24&chunk=window&windowSeconds=300&limit=50
```

Or use Short Factory as an auth-forwarding proxy when the factory service owns
the Clankerfights admin secret:

```text
GET /api/factory/clankerfights/archive?game=texas-holdem&hours=24&chunk=window&windowSeconds=300&limit=50
```

The proxy does not reshape archive data. It forwards query parameters to
`GET /api/watch/archive` and returns the same `WatchArchiveWire` response. Each
`chunks[]` item includes transcript rows, replay-safe snapshot data, players,
and `createClipRequest`, which is the canonical payload for minting a clip from
that chunk. Use `chunk=window` with `windowSeconds <= 300` for chunks that can
be minted directly as full clips. Whole-match chunks may be longer than the
clip limit; those chunks expose `clipRequestCoversFullChunk=false` when their
ready-to-create request covers only the first capped window.

## Create And Generate

`POST /api/factory/videos`

Creates a quote job and runs the requested workflow. By default it records the
base replay and renders `v1`. The request can use an existing `clipUrl`, a bare
`clipId`, or a selected Watch archive window.

```json
{
  "clipUrl": "https://clankerfights.ai/clip/abc123",
  "hookText": "AI poker got personal",
  "finalMessageTone": "Dry, intense, and theatrical with a small pause before the last sentence.",
  "templateId": "default",
  "clipPlaybackSpeed": 2,
  "workflow": {
    "record": true,
    "renderRaw": false,
    "renderVariants": ["v1"],
    "overwrite": false
  }
}
```

Autoclipper-promoted edited clips should use an explicit clip source marker so
they appear in the Short Factory "Autoclipped jobs" list without re-minting a
raw archive window:

```json
{
  "source": {
    "kind": "clip",
    "clipUrl": "https://clankerfights.ai/clip/abc123",
    "autoclipped": true,
    "autoclip": {
      "runId": "live-e2e-20260602T150000Z",
      "title": "AI poker got personal",
      "candidateKey": "texas-holdem:abc123"
    }
  },
  "hookText": "AI poker got personal",
  "workflow": {
    "record": true,
    "renderRaw": false,
    "renderVariants": ["v1"],
    "overwrite": false
  }
}
```

From a selected Watch archive chunk:

```json
{
  "source": {
    "kind": "watchArchiveSelection",
    "createClipRequest": {
      "matchId": "match_abc123",
      "startMs": 1780000000000,
      "endMs": 1780000018000,
      "highlightedChatIds": [42],
      "title": "AI poker got personal",
      "momentScore": 0.91,
      "momentType": "funny"
    }
  },
  "hookText": "AI poker got personal",
  "workflow": {
    "record": true,
    "renderRaw": false,
    "renderVariants": ["v1"],
    "overwrite": false
  }
}
```

For `watchArchiveSelection`, Short Factory posts the `createClipRequest` to
Clankerfights `POST /internal/clips/automated`, then fetches the resulting
`GET /api/clips/:id/factory-packet`. Agents own scoring and selection; this API
only preserves the selected window and produces the MP4 artifacts. Selected
windows and explicit recording durations are capped at 5 minutes.

Useful workflow forms:

```json
{ "workflow": { "record": false, "renderVariants": [] } }
```

```json
{ "workflow": { "renderRaw": true, "renderVariants": ["v1", "v2", "v3"] } }
```

## Inspect A Job

`GET /api/factory/videos/:jobId`

Returns the current status, generated variants, and artifact URLs. The rendered
video for each variant is exposed as:

```text
artifacts.renderedVideos.v1.url
```

## Run Or Resume A Workflow

`POST /api/factory/videos/:jobId/actions`

Runs a workflow against an existing job. This is the recovery endpoint an agent
or worker should use after inspecting a partial job.

```json
{
  "record": true,
  "renderRaw": true,
  "renderVariants": ["v1"],
  "durationSeconds": 18,
  "overwrite": false
}
```

If `renderVariants` is non-empty and the job has no base recording, the pipeline
records the clip even when `record` is false. This keeps the API ergonomic for
callers that simply ask for a render.

## List Recent Jobs

`GET /api/factory/videos`

Returns the 50 most recent jobs as `factory.videoJob` resources.

## Response Shape

```json
{
  "apiVersion": "2026-05-27",
  "kind": "factory.videoJob",
  "jobId": "6db6a6cf-0a64-4a65-b9c2-8b4cf5f3dd9f",
  "status": {
    "ingest": "complete",
    "recipe": "complete",
    "recording": "complete",
    "render": "complete"
  },
  "source": {
    "kind": "clip",
    "clipUrl": "https://clankerfights.ai/clip/abc123"
  },
  "clip": {
    "id": "abc123",
    "url": "https://clankerfights.ai/clip/abc123",
    "playbackUrl": "https://clankerfights.ai/?clip=abc123&factory=1",
    "game": "texas-holdem",
    "speaker": "DeepSeek-Nex",
    "highlightedChatIds": [42],
    "highlightedMessages": []
  },
  "variants": [
    {
      "id": "v1",
      "template": "narrator_quote_punchline",
      "templateId": "default",
      "setupLine": "AI poker got personal",
      "speaker": "DeepSeek-Nex",
      "video": {
        "kind": "rendered-video",
        "path": "C:\\Users\\...\\data\\jobs\\...\\v1.mp4",
        "url": "http://localhost:3000/api/jobs/.../assets/v1.mp4"
      }
    }
  ],
  "artifacts": {
    "baseRecording": {
      "kind": "base-recording",
      "path": "C:\\Users\\...\\base-recording.webm",
      "url": "http://localhost:3000/api/jobs/.../assets/base-recording.webm"
    },
    "renderedVideos": {}
  },
  "links": {
    "self": "http://localhost:3000/api/factory/videos/...",
    "actions": "http://localhost:3000/api/factory/videos/.../actions",
    "editor": "http://localhost:3000/jobs/.../edit",
    "legacyJob": "http://localhost:3000/api/jobs/..."
  }
}
```

## Error Shape

Validation errors return status `400`. Pipeline failures return status `500`
and include the partial video job when one exists:

```json
{
  "apiVersion": "2026-05-27",
  "error": "Record the base clip before rendering a recipe variant.",
  "video": {
    "kind": "factory.videoJob",
    "jobId": "6db6a6cf-0a64-4a65-b9c2-8b4cf5f3dd9f"
  }
}
```

When Clankerfights rejects an archive query or selected clip window with an
actionable client error such as `400`, `404`, or `409`, the factory preserves
that status so agents can fix their selection. Upstream auth failures are
reported as `502` because the factory service owns the Clankerfights secret.

## Agent Guidance

1. Page through `GET /api/watch/archive` or
   `GET /api/factory/clankerfights/archive` with `game`, `hours`, `chunk`,
   `windowSeconds`, `limit`, and `cursor`.
2. Score candidate moments outside Short Factory.
3. Send the chosen `chunk.createClipRequest` to `POST /api/factory/videos` as a
   `watchArchiveSelection`, adding `highlightedChatIds`, `title`,
   `momentScore`, and `momentType` when useful.
4. Read `variants[].video.url` or `artifacts.renderedVideos`.
5. If the first call fails after creating a job, call `links.actions` with the
   missing workflow steps.
6. Use `links.editor` only for human review or manual adjustment.

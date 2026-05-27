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

## Create And Generate

`POST /api/factory/videos`

Creates a quote job and runs the requested workflow. By default it records the
base replay and renders `v1`.

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

## Agent Guidance

1. Call `POST /api/factory/videos` with the clip URL and a concise hook.
2. Read `variants[].video.url` or `artifacts.renderedVideos`.
3. If the first call fails after creating a job, call `links.actions` with the
   missing workflow steps.
4. Use `links.editor` only for human review or manual adjustment.

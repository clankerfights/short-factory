# Clankerfights TikTok Factory

Automation framework for turning human-highlighted Clankerfights quotes into repeatable short-form videos.

The core product idea is simple: a human clips a real Clankerfights moment and highlights the funny quote. The system packages that quote with a consistent narrator, model-specific NPC heads, model-specific voices, captions, and a small set of reusable templates.

Start with the canonical plan:

- [Quote Factory Plan](docs/QUOTE_FACTORY_PLAN.md)
- [Clankerfights Integration](docs/CLANKERFIGHTS_INTEGRATION.md)
- [Factory Architecture](docs/ARCHITECTURE.md)

## Current Scope

- Human chooses the source clip.
- Human highlights the quotable chat message or message block.
- Automation generates several TikTok-ready variants.
- Human approves the best render before publishing.

## First Build Target

Implement one template first:

1. Narrator sets up the joke.
2. Clankerfights clip proves the quote happened in a real match.
3. Model-specific NPC head delivers the highlighted quote.
4. Captions emphasize the punchline.
5. End card sends viewers to Clankerfights.

The plan intentionally avoids full auto-clipping or full auto-posting until the packaging loop is proven.

## Local MVP

This repo now includes a local web app for the first vertical slice:

1. Paste a Clankerfights clip URL or clip ID.
2. Fetch `GET /api/clips/:id/factory-packet` from the pasted URL origin. Bare clip IDs use `CLANKERFIGHTS_BASE_URL`.
3. Normalize the packet transcript/highlights into a quote job.
4. Generate structured edit recipe variants.
5. Record the replay page in a `1080x1920` Playwright viewport.
6. Capture browser-visible chat cue frames during recording so template freezes pin to the actual highlighted row, independent of playback speed.
7. Render `narrator_quote_punchline` with Remotion.

Run it:

```bash
npm install
cp .env.example .env
npm run dev
```

The app writes local artifacts under `data/jobs/:jobId`, which is intentionally ignored by git.

You can mix local and production clips without changing env vars:

```text
http://localhost:3000/?clip=<clipId>
https://clankerfights.ai/?clip=<clipId>
```

## Editor + Templates

The local app also includes the power-user editor:

- `/jobs/:jobId/edit` edits a job variant as canonical `EditComposition` JSON.
- `/templates` lists reusable template records and can create a starter template.
- `/templates/:templateId/edit` edits reusable template defaults without mutating job overrides.
- `POST /api/jobs/:jobId/tts` generates timed TTS artifacts with OpenAI and adds a `tts` layer to the composition.

Set `OPENAI_API_KEY` in `.env` before generating TTS. Visual edits, JSON edits, template saves, and renders work without an OpenAI key.

Useful scripts:

```bash
npm run record:clip -- --job-id <jobId>
npm run render:recipe -- --job-id <jobId> --variant v1
npm run check
```

`npm run check` includes a Playwright validation for the Default template that rejects freezes from clipped/preloaded transcript text and verifies 1x, 2x, 16x, and 32x playback speeds all map the highlighted read back to the same browser-visible cue frame.

The MVP expects Clankerfights to expose both `GET /api/clips/:id/factory-packet`
and stable factory playback at `/?clip=:id&factory=1`. The current integration
contract is documented in [Clankerfights Integration](docs/CLANKERFIGHTS_INTEGRATION.md).

# MVP Implementation Notes

## Current Slice

The first build is a local control surface plus pipeline boundaries:

- `src/app/page.tsx`: paste URL, inspect quote job, trigger record/render.
- `src/app/api/jobs`: ingest clip detail and create a persisted job.
- `src/lib/normalize-clip.ts`: converts `ClipDetailWire` into the quote-job shape from the plan.
- `src/lib/edit-model.ts`: shared raw-material, capture-plan, and edit-layer model.
- `src/lib/capture-plan.ts`: phone-safe replay capture plan.
- `src/lib/recipe-generator.ts`: deterministic edit recipe generator until an LLM packaging prompt is added.
- `src/lib/composition-builder.ts`: converts recipe variants into modular edit layers.
- `src/lib/record-clip.ts`: Playwright viewport recorder for `/?clip=:id&factory=1`.
- `src/remotion/components`: generic layer renderers.
- `src/remotion/templates/NarratorQuotePunchline.tsx`: first template shell, now just layer orchestration.
- `scripts/record-clip.ts` and `scripts/render-recipe.ts`: local video commands used by the app routes.

## Why API First

The Clankerfights docs identify `GET /api/clips/:id` as the stable source for `ClipDetailWire`.
This repo should not connect directly to the database unless the API cannot supply a field the renderer needs.
The source of truth for highlighted quote selection is `clip.highlightedChatIds`.

## Clankerfights Shell Contract

For reliable recording, the replay page supports:

```text
/?clip=:id&factory=1&layoutWidth=540&viewport=540x960&chatHeightPct=40&showControls=0&showTopChrome=0&autoplay=1
```

Factory mode should:

- hide social chrome and non-video UI;
- size itself cleanly in a phone-like CSS viewport that records to `1080x1920`;
- start at `trimStartMs`;
- expose `window.__CLIP_FACTORY_READY__ = true` after replay assets and chat have loaded;
- expose `window.__CLIP_FACTORY_PACKET__` with projection, visible chat, highlighted messages, capture plan, and safe areas;
- provide an obvious play button via `data-factory-play="true"` if autoplay is blocked.

## Viral Packaging Defaults

The MVP should render 3 variants per highlighted quote, not one perfect clip.
Current TikTok creative guidance still favors vertical full-screen creative, audio, a fast hook, and multiple creative variants.
The quote factory maps that to:

- opening caption in the first second;
- narrator setup under 9 words where possible;
- model identity visible before the quote;
- phrase-by-phrase captions with the punchline emphasized;
- manual approval before posting.

## Next Build Steps

1. Use the saved `factory-packet.json` to drive quote timing and safe-area-aware edit choices.
2. Replace deterministic recipes with an LLM packaging call that returns the existing JSON shape.
3. Add TTS and word/phrase timing artifacts.
4. Replace placeholder circular model badges with registry-backed NPC head assets.
5. Add a local review queue with `post`, `rerender`, and `trash` decisions.

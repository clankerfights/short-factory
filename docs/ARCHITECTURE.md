# Factory Architecture

## Design Principle

The factory should not be a pile of one-off video edits. It should be a small compiler:

1. Clankerfights provides a stable factory packet over replay materials.
2. The factory normalizes those materials into a quote job.
3. The packager creates edit recipes.
4. A renderer interprets generic edit layers.

The highest-value boundary is between Clankerfights and the factory. Clankerfights owns replay truth. The factory owns packaging.

## Clankerfights Raw Materials

The factory should ingest `GET /api/clips/:id/factory-packet` and preserve
these primitives:

- `clipId`
- `playbackUrl`
- `highlightedChatIds`
- `game`
- `gameRevisionId`
- `players`
- transcript rows with speaker names, timestamps, playback seconds, and timing confidence
- capture plan, safe areas, clock map, and edit manifest

The factory normalizes those into `ClipRawMaterials` in `src/lib/edit-model.ts`.

The raw-material packet intentionally carries both human-highlighted quote data and capture instructions:

- source and playback URLs;
- trim window;
- highlighted message IDs and message text;
- player roster;
- `ClipCapturePlan`, which describes viewport size, replay layout width, readiness signal, and playback behavior.

## Capture Plan

The current capture plan is `phone-fit-replay-v1`:

- records a mobile CSS viewport, currently `540x960`, into a `1080x1920` video;
- opens Clankerfights with `factory=1`, `layoutWidth=540`, `viewport=540x960`, and `chatHeightPct=40`;
- lets Clankerfights use its normal responsive mobile replay layout;
- waits for `window.clankerClip.ready()` with legacy `window.__CLIP_FACTORY_READY__` fallback;
- saves `window.__CLIP_FACTORY_PACKET__` beside the base recording when available;
- starts playback through `window.clankerClip.play()` with selector fallback when autoplay is blocked.

Clankerfights PR 776 moved this from recorder-owned DOM surgery to shell-owned factory mode. The recorder now only injects legacy fallback CSS if the upstream factory packet is missing.

Clankerfights factory-mode query/config knobs:

- `factory=1`
- `layoutWidth=540`
- `viewport=540x960`
- `chatHeightPct=40`
- `showControls=0`
- `showTopChrome=0`
- `highlightedChatIds=...`
- `autoplay=1`

Globals from the Clankerfights page:

- `window.__CLIP_FACTORY_READY__ = true`
- `window.__CLIP_FACTORY_PACKET__ = ClipFactoryPacketWire`
- `window.clankerClip = { ready, packet, play, pause, seek, duration, state }`

## Edit Model

The renderer consumes `EditComposition`, not template-specific JSX.

Core layer types:

- `video-source`: base recording, fit mode, box, filters, scale animation.
- `text`: opening captions, setup lines, punchline captions, emphasis phrases, timing, position, size.
- `speaker-badge`: model identity and expression state.
- `cta`: end card text and style.

This means future edits should be data changes:

- move an overlay by changing `box`;
- resize a caption by changing `style.fontSize`;
- change when text appears by changing `time`;
- zoom the replay by changing the video layer animation;
- make chat larger by changing the capture plan or Clankerfights factory mode;
- add reaction heads by adding new layer kinds instead of rewriting the template.

## Template Role

`narrator_quote_punchline` is now a composition builder plus generic layer rendering:

- `src/lib/composition-builder.ts` builds the layer plan.
- `src/remotion/components/*` renders reusable layer primitives.
- `src/remotion/templates/NarratorQuotePunchline.tsx` only loops through layers.

New templates should follow the same pattern:

1. Generate or choose an `EditComposition`.
2. Reuse generic layers where possible.
3. Add new layer kinds only for real new concepts, such as reaction-head groups, chat-callout boxes, freeze-frame markers, or game-state annotations.

## Clankerfights Features Worth Moving Upstream

These are easier and more reliable inside Clankerfights than in the factory recorder:

- a true `factory=1` layout mode that hides share/top chrome;
- stable portrait-safe replay scaling;
- explicit chat panel height control;
- auto-play from `trimStartMs`;
- a replay-ready signal after game iframe and chat load;
- an exported projection packet containing visible chat, highlighted messages, segment boundaries, and safe crop boxes;
- optional DOM hooks for current pot, hand result, win chance, active player, and major action labels.

The factory can then automatically choose edits like:

- zoom to table only;
- zoom to the active speaker seat;
- enlarge or hide chat;
- freeze on highlighted chat;
- add a callout over a specific highlighted row;
- add a board-state overlay only when the game provides structured state.

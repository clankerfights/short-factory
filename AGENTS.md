# Clankerfights TikTok Factory

This repo turns human-highlighted Clankerfights quotes into short-form videos; the canonical product/technical plan is `docs/QUOTE_FACTORY_PLAN.md`.

The MVP assumes the human chooses the source clip and highlighted quote; do not build automatic funny-moment detection before the quote-packaging loop works.

The LLM should output edit recipes, not render videos directly; renderers consume structured JSON from `schemas/edit-recipe.example.json`.

Same model must always map to the same voice, NPC head family, and caption color through the asset registry.

Templates must stay generalizable; avoid hardcoding temporary bits like "Ling is caveman" into architecture.

Clankerfights clips are replay snapshots, not raw MP4s; ingest `GET /api/clips/:id/factory-packet` first, then record the provided capture URL/page as the base video.

The Default template freezes highlighted chat from browser-visible `artifacts.chatCueTiming` source frames; playback speed only changes output timing, never the detected cue frame.

Model personas may use vendor/model identity and observed behavior, but never racial caricature, mocked accents, slurs, or nationality as the punchline.

Default renderer direction is Remotion for code-owned templates; Creatomate or Shotstack are acceptable if speed-to-MVP matters more than local control.

Manual approval comes before publishing until brand-safety and performance feedback loops exist.

# Clankerfights TikTok Factory

Automation framework for turning human-highlighted Clankerfights quotes into repeatable short-form videos.

The core product idea is simple: a human clips a real Clankerfights moment and highlights the funny quote. The system packages that quote with a consistent narrator, model-specific NPC heads, model-specific voices, captions, and a small set of reusable templates.

Start with the canonical plan:

- [Quote Factory Plan](docs/QUOTE_FACTORY_PLAN.md)
- [Clankerfights Integration](docs/CLANKERFIGHTS_INTEGRATION.md)

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

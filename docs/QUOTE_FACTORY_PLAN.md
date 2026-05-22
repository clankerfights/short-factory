# Clankerfights TikTok Quote Factory

## 1. Goal

Build a low-human-effort system that turns a human-highlighted Clankerfights quote into multiple TikTok-ready clips.

The factory is not trying to automatically find every funny moment at first. The human does the high-taste part:

1. Finds a funny Clankerfights clip.
2. Highlights the quotable chat line or message block.
3. Sends it to the factory.

The factory does the repeatable packaging:

1. Chooses a short narrator setup.
2. Picks a reusable video template.
3. Applies the speaker's consistent NPC head, voice, colors, and caption style.
4. Generates several variants.
5. Places the renders into a human approval queue.

The core creative principle:

> Package the quote, not the gameplay. The game footage is the receipt that proves the absurd quote happened inside a real AI match.

## 2. Non-Goals For The MVP

- No fully automatic funny-moment detection.
- No direct-to-TikTok auto-posting.
- No bespoke animation per clip.
- No complicated story-building from the hand history.
- No reliance on one temporary bit, such as "Ling is always caveman."

The durable system is:

> Same model means same character wrapper. The highlighted quote determines the joke.

## 3. Human Workflow

### MVP Human Input

The human supplies:

- `clipUrl`: public or locally accessible Clankerfights clip URL.
- Highlighted chat rows saved in Clankerfights' clip editor.
- `speaker`: inferred from the highlighted message when possible.
- Optional `toneHint`: rough tag like `too_deep`, `caveman`, `roast`, `matrix`, `overconfident`, `broken`, `iconic`.

### Ideal UI

On a Clankerfights clip page:

1. Human drags/selects messages in the chat transcript.
2. Human clicks `Generate TikTok`.
3. System opens a generation job with the selected messages and clip metadata.
4. Human reviews 3-5 rendered variants.
5. Human marks each variant `post`, `rerender`, or `trash`.

## 4. Input Data Contract

### Minimum Input

```json
{
  "clipUrl": "https://clankerfights.ai/?clip=...",
  "game": "texas-holdem",
  "speaker": "DeepSeek-Nex",
  "highlightedMessages": [
    {
      "speaker": "DeepSeek-Nex",
      "channel": "spectator",
      "text": "The man is a statue of his own mistakes...",
      "timeStart": 42.1,
      "timeEnd": 55.6
    }
  ],
  "toneHint": "too_deep"
}
```

### Preferred Input

The factory should ingest the canonical `ClipFactoryPacketWire` from
`GET /api/clips/:id/factory-packet`. Clankerfights owns replay projection,
visibility, transcript timing, capture URLs, and source provenance; short-factory
normalizes that packet into quote jobs and edit recipes.

```json
{
  "clipId": "311d1d74-06de-48...",
  "clipUrl": "https://clankerfights.ai/?clip=311d1d74-06de-48...",
  "playbackUrl": "https://clankerfights.ai/?clip=311d1d74-06de-48...&factory=1",
  "captureUrl": "https://clankerfights.ai/api/clips/311d1d74-06de-48.../capture",
  "game": { "id": "texas-holdem", "name": "Texas Hold'em" },
  "durationSeconds": 64,
  "safeAreas": { "captions": { "x": 64, "y": 1360, "width": 952, "height": 360 } },
  "messages": [
    {
      "id": "msg_01",
      "speaker": "DeepSeek-Nex",
      "channel": "spectator",
      "text": "The man is a statue of his own mistakes...",
      "startSeconds": 42.1,
      "endSeconds": 55.6,
      "timingConfidence": "estimated"
    }
  ],
  "highlightedMessageIds": [1],
  "gameFacts": [
    {
      "time": 40.2,
      "type": "winChance",
      "player": "Ling-Flash",
      "value": 10
    }
  ]
}
```

### Why The Rich Packet Matters

The factory should not scrape chat pixels if Clankerfights already knows the transcript, timestamps, speakers, and highlighted IDs. Structured input lets the renderer:

- Start the clip near the highlighted quote.
- Keep captions aligned with speech.
- Add optional board-context overlays only when they help the joke.
- Avoid hallucinating speaker names or messages.

For the actual Clankerfights integration details, see `docs/CLANKERFIGHTS_INTEGRATION.md`.

## 5. Asset Registry

Every model gets a persistent character wrapper. This is what makes clips feel like a recurring show instead of random screen recordings.

```json
{
  "DeepSeek-Nex": {
    "displayName": "DeepSeek-Nex",
    "voiceId": "voice_deepseek_nex",
    "captionColor": "#00e0b8",
    "heads": {
      "neutral": "assets/heads/deepseek-neutral.png",
      "intense": "assets/heads/deepseek-intense.png",
      "confused": "assets/heads/deepseek-confused.png",
      "smug": "assets/heads/deepseek-smug.png"
    }
  },
  "Ling-Flash": {
    "displayName": "Ling-Flash",
    "voiceId": "voice_ling_flash",
    "captionColor": "#ff4c4c",
    "heads": {
      "neutral": "assets/heads/ling-neutral.png",
      "intense": "assets/heads/ling-intense.png",
      "confused": "assets/heads/ling-confused.png",
      "smug": "assets/heads/ling-smug.png"
    }
  }
}
```

### Asset Rules

- Same model always uses the same head family.
- Same model always uses the same voice.
- Expressions are selected from the quote tone, not hand-authored per clip.
- Add new models by updating the registry, not by changing templates.

## 6. LLM Packaging Job

The LLM receives the input packet and returns an edit recipe. It must not directly render video.

### LLM Responsibilities

- Identify the punchline phrase inside the highlighted quote.
- Write 3-5 short narrator setup options.
- Choose the best template for each variant.
- Select caption emphasis.
- Select NPC expression states.
- Produce a brand-safe CTA.

### LLM Output

```json
{
  "sourceClipId": "311d1d74-06de-48...",
  "variants": [
    {
      "variantId": "v1",
      "template": "narrator_quote_punchline",
      "setupLine": "AI model goes way too hard for a poker game.",
      "openingCaption": "AI poker got existential",
      "speaker": "DeepSeek-Nex",
      "speakerExpression": "intense",
      "quoteText": "The man is a statue of his own mistakes...",
      "punchlinePhrase": "the stone of my own creation",
      "highlightPhrases": [
        "statue of his own mistakes",
        "bullet of his own destruction",
        "stone of my own creation"
      ],
      "captionStyle": "dramatic",
      "cta": "Real AI matches at clankerfights.ai"
    }
  ]
}
```

### Prompt Guardrails

The LLM should prefer:

- Short hooks under 9 words.
- Quotes that make sense without poker knowledge.
- Absurd contrast between "AI model" and "stupid game."
- Punchlines that can be understood in 1-2 seconds.

The LLM should avoid:

- Explaining the full game state.
- Creating fake chat lines.
- Rewriting the highlighted quote unless a safe bleeped variant is explicitly requested.
- Hooks that depend on a model-specific stereotype that is not present in the quote.

## 7. Template Set

### Template 1: Narrator Quote Punchline

This is the MVP template and should handle most clips.

Timeline:

1. `0.0s`: Big opening caption.
2. `0.2s`: Narrator voice reads the setup line.
3. `1.5s`: Clip zooms or freezes on the game.
4. `2.0s`: Speaker NPC head appears.
5. `2.2s`: Speaker voice reads the highlighted quote.
6. `2.2s+`: Captions appear phrase-by-phrase.
7. Punchline phrase: zoom, sound sting, expression change.
8. Final second: Clankerfights CTA.

Works for:

- "AI model goes caveman."
- "AI model goes way too hard for a poker game."
- "AI is breaking out of the matrix."
- "We are not ready for the next AI model."

### Template 2: Deadpan Proof

For short absurd lines.

Narrator says something like:

- "This is allegedly an advanced AI."
- "This model was trained on the whole internet."

Then the bot says the quote.

### Template 3: Matrix Alarm

For uncanny, threatening, or system-breaking quotes.

Narrator says something like:

- "AI is getting out of control."
- "The poker bot started receiving transmissions."

Visual style:

- Small glitch effect.
- Warning caption.
- Confused reaction heads.

### Template 4: Too Hard For Poker

For philosophical, dramatic, or over-written quotes.

Narrator says something like:

- "AI model goes way too hard for a poker game."
- "Nobody asked for the poker bot's villain monologue."

Visual style:

- Slow zoom.
- Dramatic captions.
- Silent NPC reactions.

### Template 5: Iconic Model Moment

For model-specific quotes where the speaker becomes memorable.

Narrator says something like:

- "Chinese AI is iconic."
- "This model has no chill."
- "This model is operating on a different frequency."

Use carefully. The quote should justify the framing.

## 8. Tooling Recommendation

### Renderer

Use one of these:

1. Remotion for code-owned templates.
2. Creatomate for API-driven template rendering.
3. Shotstack for JSON timeline rendering.

Recommended path:

- Use Remotion if this repo will become a real product and you want version-controlled templates.
- Use Creatomate if you want the fastest no-code-ish MVP with hosted rendering.
- Use Shotstack if the team prefers JSON edit timelines over React templates.

### Text-To-Speech

Use a programmatic TTS provider:

- OpenAI TTS for simple integration.
- ElevenLabs for more voice-style control.
- Cartesia for low-latency generation.

Do not depend on TikTok's native voice for the factory. The factory needs deterministic renders before upload.

### Captions

For MVP, captions should come from the highlighted text and generated TTS timings. Forced alignment can be added later.

Caption priorities:

- Large enough for mobile.
- Phrase-by-phrase, not full paragraphs.
- Punchline phrase gets special emphasis.
- Respect TikTok safe zones.

### Publishing

Manual publish first.

Later options:

- TikTok Content Posting API.
- Scheduler integration.
- Export to a shared folder for manual posting.

Do not automate posting until the approval and brand-safety loop is proven.

## 9. Automation Framework

### Stage 1: Ingest

Input:

- Clip URL or video URL.
- Highlighted quote.
- Speaker.
- Optional tone hint.

Output:

- Validated quote job.

### Stage 2: Package

Input:

- Quote job.
- Asset registry.
- Template registry.

Output:

- 3-5 edit recipes.

### Stage 3: Generate Audio

Input:

- Narrator setup lines.
- Speaker quote.
- Voice IDs.

Output:

- Narrator audio file.
- Speaker audio file.
- Approximate word or phrase timings.

### Stage 4: Render

Input:

- Source clip.
- Edit recipe.
- Audio files.
- NPC head assets.

Output:

- MP4 variants in 9:16 format.

### Stage 5: Review

Human marks each output:

- `post`
- `rerender`
- `trash`

The review decision is stored with metadata so the system can learn.

### Stage 6: Metrics

Track every posted clip:

```json
{
  "variantId": "v1",
  "template": "too_hard_for_poker",
  "setupLine": "AI model goes way too hard for a poker game.",
  "speaker": "DeepSeek-Nex",
  "durationSeconds": 18,
  "views": 0,
  "threeSecondHoldRate": null,
  "completionRate": null,
  "shares": 0,
  "comments": 0,
  "postedAt": null
}
```

Use metrics later to learn:

- Which narrator setup lines work.
- Which templates work per quote type.
- Which speakers create recurring audience recognition.
- Which durations keep retention.

## 10. First Implementation Plan

### Milestone 1: Spec-Only Prototype

- Create JSON schemas for quote jobs, asset registry, and edit recipes.
- Write one LLM packaging prompt.
- Create sample input jobs from real Clankerfights quotes.

### Milestone 2: Render One Template

- Build `narrator_quote_punchline`.
- Render one DeepSeek quote and one Ling quote.
- Confirm output reads clearly on mobile.

### Milestone 3: Variant Generation

- Generate 3 setup lines per quote.
- Render 3 variants from the same highlighted quote.
- Add simple approval metadata.

### Milestone 4: Approval Queue

- Add a local review UI or static HTML gallery.
- Let human mark `post`, `rerender`, or `trash`.

### Milestone 5: Metrics Loop

- Store platform metrics manually at first.
- Compare template and hook performance.
- Promote winning setup lines into the default prompt.

## 11. Success Criteria

The MVP works when:

- A human can go from highlighted quote to 3 rendered variants in under 2 minutes.
- The clips are understandable with no knowledge of poker.
- The model identity is visually consistent across clips.
- The funniest phrase is obvious even with sound off.
- The human only makes approval decisions after highlighting the quote.

## 12. Core Product Sentence

Clankerfights TikTok Factory turns real AI chat from live game clips into short-form quote memes with consistent AI character heads, voices, narrator setup, captions, and reusable templates.

## 13. Research References

Short-form creative guidance:

- TikTok creative best practices: https://ads.tiktok.com/help/article/creative-best-practices
- TikTok Creative Insights: https://ads.us.tiktok.com/help/article/creative-insights
- TikTok Smart Creative: https://ads.us.tiktok.com/help/article/smart-creative
- TikTok AI-generated content disclosure: https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content
- TikTok Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started

Renderer and automation tools:

- Remotion: https://www.remotiondocs.com/
- Creatomate template API: https://creatomate.com/docs/api/quick-start/create-a-video-by-template
- Shotstack API: https://shotstack.io/docs/api/

Voice tools:

- OpenAI text-to-speech: https://platform.openai.com/docs/guides/text-to-speech
- ElevenLabs text-to-speech: https://elevenlabs.io/docs/overview/capabilities/text-to-speech
- Cartesia: https://cartesia.ai/

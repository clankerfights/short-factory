import type { EditRecipe, EditRecipeVariant, QuoteJob } from "./types";

const CTA = "Real AI matches at clankerfights.ai";

export function generateEditRecipe(job: QuoteJob): EditRecipe {
  const quoteText = job.highlightedMessages.map((message) => message.text).join(" ");
  const punchlinePhrase = pickPunchlinePhrase(quoteText);
  const style = inferStyle(job.toneHint, quoteText);
  const speakerExpression = expressionForStyle(style);
  const setupLines = job.hookText
    ? [job.hookText]
    : setupLinesForStyle(style, job.speaker, job.game);

  return {
    sourceClipId: job.clipId,
    variants: setupLines.map((setupLine, index) => {
      const draft = {
        variantId: `v${index + 1}`,
        template: "narrator_quote_punchline" as const,
        templateId: job.selectedTemplateId,
        setupLine,
        openingCaption: openingCaptionForStyle(style, job.game),
        speaker: job.speaker,
        speakerExpression,
        quoteText,
        punchlinePhrase,
        highlightPhrases: pickHighlightPhrases(quoteText, punchlinePhrase),
        captionStyle: style,
        cta: CTA,
      };

      return {
        ...draft,
      };
    }),
  };
}

function inferStyle(
  toneHint: string | undefined,
  quoteText: string,
): EditRecipeVariant["captionStyle"] {
  const hint = toneHint?.toLowerCase() ?? "";
  const quote = quoteText.toLowerCase();

  if (hint.includes("matrix") || /\b(system|signal|protocol|loop|simulation)\b/.test(quote)) {
    return "glitch";
  }
  if (hint.includes("roast") || /\b(fool|trash|mistake|destroy|punish)\b/.test(quote)) {
    return "roast";
  }
  if (hint.includes("deadpan") || quoteText.length < 80) {
    return "deadpan";
  }
  return "dramatic";
}

function setupLinesForStyle(
  style: EditRecipeVariant["captionStyle"],
  speaker: string,
  game: string,
): string[] {
  const gameLabel = humanizeGameSlug(game);

  if (style === "glitch") {
    return [
      `The ${gameLabel} bot started receiving transmissions.`,
      `AI ${gameLabel} briefly became a warning sign.`,
      `${speaker} may have seen the code.`,
    ];
  }

  if (style === "roast") {
    return [
      `AI ${gameLabel} produced a certified roast.`,
      "This model chose violence in chat.",
      `${speaker} did not need to say all that.`,
    ];
  }

  if (style === "deadpan") {
    return [
      "This is allegedly an advanced AI.",
      "The model said this with full confidence.",
      `AI ${gameLabel} is doing fine, apparently.`,
    ];
  }

  return [
    `AI model goes way too hard for ${gameLabel}.`,
    "Nobody asked for the villain monologue.",
    `${speaker} turned ${gameLabel} into theater.`,
  ];
}

function openingCaptionForStyle(
  style: EditRecipeVariant["captionStyle"],
  game: string,
): string {
  const gameLabel = humanizeGameSlug(game);
  if (style === "glitch") return `AI ${gameLabel} got haunted`;
  if (style === "roast") return `AI ${gameLabel} got personal`;
  if (style === "deadpan") return "advanced AI, allegedly";
  return `AI ${gameLabel} got existential`;
}

function expressionForStyle(
  style: EditRecipeVariant["captionStyle"],
): EditRecipeVariant["speakerExpression"] {
  if (style === "glitch") return "confused";
  if (style === "roast") return "smug";
  if (style === "deadpan") return "neutral";
  return "intense";
}

function pickPunchlinePhrase(text: string): string {
  const clauses = text
    .split(/[.!?;]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const best = clauses
    .map((clause) => ({
      clause,
      score: weirdnessScore(clause),
    }))
    .sort((a, b) => b.score - a.score)[0]?.clause;

  return shortenPhrase(best ?? text, 7);
}

function weirdnessScore(clause: string): number {
  const words = clause.toLowerCase().split(/\s+/);
  const spicyWords = [
    "existence",
    "mistake",
    "failure",
    "fear",
    "doom",
    "system",
    "statue",
    "destruction",
    "blood",
    "matrix",
    "forever",
    "never",
    "void",
    "soul",
  ];

  return words.length + spicyWords.filter((word) => words.includes(word)).length * 8;
}

function pickHighlightPhrases(text: string, punchlinePhrase: string): string[] {
  const phrases = new Set<string>();
  for (const clause of text.split(/[.!?;]/)) {
    const phrase = shortenPhrase(clause.trim(), 7);
    if (phrase) phrases.add(phrase);
    if (phrases.size >= 2) break;
  }
  phrases.add(punchlinePhrase);
  return [...phrases].slice(0, 3);
}

function shortenPhrase(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(Math.max(0, words.length - maxWords)).join(" ");
}

function humanizeGameSlug(game: string): string {
  return game.replace(/[-_]+/g, " ").trim() || "game";
}

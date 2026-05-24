import { buildNarratorQuoteComposition } from "../../lib/composition-builder";
import { listTemplates } from "../../lib/template-store";
import { TemplatesClient } from "./TemplatesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const starterVariant = {
  variantId: "template-starter",
  template: "narrator_quote_punchline" as const,
  setupLine: "AI model goes way too hard for the endgame.",
  openingCaption: "AI drama got cinematic",
  speaker: "Qwen-Duchess",
  speakerExpression: "intense" as const,
  quoteText: "I took out the loudest threat, but now I look suspicious.",
  punchlinePhrase: "now I look suspicious",
  highlightPhrases: ["now I look suspicious"],
  captionStyle: "dramatic" as const,
  cta: "Real AI matches at clankerfights.ai",
};

export default async function TemplatesPage() {
  const templates = await listTemplates();
  return (
    <TemplatesClient
      templates={templates}
      starterComposition={buildNarratorQuoteComposition(starterVariant)}
    />
  );
}

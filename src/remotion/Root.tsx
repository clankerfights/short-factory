import { Composition } from "remotion";
import { TIKTOK_CANVAS } from "../lib/edit-model";
import { NarratorQuotePunchline } from "./templates/NarratorQuotePunchline";
import type { RemotionFactoryProps } from "./types";
import "../styles/tiktok-sans.css";

const defaultProps: RemotionFactoryProps = {
  baseVideoSrc: "",
  baseVideoTiming: undefined,
  variant: {
    variantId: "v1",
    template: "narrator_quote_punchline",
    setupLine: "AI model goes way too hard for poker.",
    openingCaption: "AI poker got existential",
    speaker: "DeepSeek-Nex",
    speakerExpression: "intense",
    quoteText: "The man is a statue of his own mistakes.",
    punchlinePhrase: "statue of his own mistakes",
    highlightPhrases: ["statue of his own mistakes"],
    captionStyle: "dramatic",
    cta: "Real AI matches at clankerfights.ai",
  },
};

export function RemotionRoot() {
  return (
    <Composition
      id="narrator-quote-punchline"
      component={NarratorQuotePunchline}
      durationInFrames={TIKTOK_CANVAS.durationFrames}
      fps={TIKTOK_CANVAS.fps}
      width={TIKTOK_CANVAS.width}
      height={TIKTOK_CANVAS.height}
      defaultProps={defaultProps}
    />
  );
}

import { TIKTOK_CANVAS, type EditComposition } from "./edit-model";
import type { EditRecipeVariant } from "./types";

type DraftVariant = Omit<EditRecipeVariant, "composition">;

const STYLE_COLORS = {
  dramatic: { accent: "#00e0b8", backing: "rgba(0, 14, 18, 0.72)" },
  deadpan: { accent: "#f8f7ee", backing: "rgba(17, 17, 17, 0.76)" },
  glitch: { accent: "#8af7ff", backing: "rgba(7, 18, 24, 0.78)" },
  roast: { accent: "#ff4c4c", backing: "rgba(27, 8, 10, 0.76)" },
} as const;

export function buildNarratorQuoteComposition(
  variant: DraftVariant,
): EditComposition {
  const colors = STYLE_COLORS[variant.captionStyle];
  const quoteLayout = quoteCaptionLayout(variant.quoteText);

  return {
    canvas: TIKTOK_CANVAS,
    layers: [
      {
        id: "base-recording",
        kind: "video-source",
        source: "base-recording",
        time: { start: 0, duration: TIKTOK_CANVAS.durationFrames },
        box: { x: 0, y: 0, width: TIKTOK_CANVAS.width, height: TIKTOK_CANVAS.height },
        fit: "cover",
        animation: { scale: { from: 1, to: 1.03, easing: "linear" } },
        filters:
          variant.captionStyle === "glitch"
            ? { contrast: 1.18, saturate: 1.15 }
            : { contrast: 1.08 },
      },
      {
        id: "opening-caption",
        kind: "text",
        time: { start: 0, duration: 110 },
        text: variant.openingCaption,
        box: { x: 66, y: 98, width: 948, height: 170 },
        style: {
          fontSize: 84,
          lineHeight: 0.96,
          weight: 950,
          color: "#ffffff",
          accentColor: colors.accent,
          textTransform: "uppercase",
          shadow: true,
        },
        animation: { enterFromY: -36 },
      },
      {
        id: "setup-line",
        kind: "text",
        time: { start: 36, duration: 150 },
        text: variant.setupLine,
        box: { x: 64, y: 330, width: 952, height: 146 },
        style: {
          fontSize: 46,
          lineHeight: 1.06,
          weight: 850,
          color: "#ffffff",
          background: colors.backing,
          borderLeftColor: "#ffffff",
          shadow: true,
        },
      },
      {
        id: "speaker-badge",
        kind: "speaker-badge",
        time: { start: 120, duration: 520 },
        speaker: variant.speaker,
        expression: variant.speakerExpression,
        box: { x: 62, y: quoteLayout.badgeY, width: 720, height: 158 },
        accentColor: colors.accent,
      },
      {
        id: "quote-caption",
        kind: "text",
        time: { start: 155, duration: 430 },
        text: variant.quoteText,
        box: { x: 58, y: quoteLayout.y, width: 964, height: quoteLayout.height },
        style: {
          fontSize: quoteLayout.fontSize,
          lineHeight: 1.02,
          weight: 940,
          color: "#ffffff",
          accentColor: colors.accent,
          background: colors.backing,
          borderColor: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          shadow: true,
        },
        emphasis: {
          phrase: variant.punchlinePhrase,
          color: colors.accent,
        },
        animation: {
          punchInFrame: 204,
        },
      },
      {
        id: "cta",
        kind: "cta",
        time: { start: 660, duration: 60 },
        text: variant.cta,
        box: { x: 0, y: 1804, width: 1080, height: 116 },
        style: {
          background: "#ffffff",
          color: "#090909",
          fontSize: 38,
          weight: 950,
        },
      },
    ],
  };
}

function quoteCaptionLayout(text: string) {
  const length = text.length;
  if (length > 260) {
    return { badgeY: 1128, y: 1328, height: 430, fontSize: 34 };
  }
  if (length > 190) {
    return { badgeY: 1168, y: 1372, height: 386, fontSize: 40 };
  }
  if (length > 130) {
    return { badgeY: 1210, y: 1418, height: 340, fontSize: 46 };
  }
  return { badgeY: 1280, y: 1480, height: 280, fontSize: 54 };
}

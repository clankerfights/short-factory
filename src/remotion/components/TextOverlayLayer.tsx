import { interpolate, useCurrentFrame } from "remotion";
import type { TextOverlayLayer as TextOverlayLayerModel } from "../../lib/edit-model";
import { FrameBox } from "./FrameBox";

export function TextOverlayLayer({ layer }: { layer: TextOverlayLayerModel }) {
  const frame = useCurrentFrame();
  const y = layer.animation?.enterFromY
    ? interpolate(frame, [layer.time.start, layer.time.start + 12], [
        layer.animation.enterFromY,
        0,
      ], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const punchActive =
    layer.animation?.punchInFrame !== undefined &&
    frame >= layer.time.start + layer.animation.punchInFrame;

  return (
    <FrameBox
      box={layer.box}
      style={{
        transform: `translateY(${y}px)`,
        padding: layer.style.background ? "24px 28px" : undefined,
        background: layer.style.background,
        border: layer.style.borderColor
          ? `5px solid ${punchActive && layer.style.accentColor ? layer.style.accentColor : layer.style.borderColor}`
          : undefined,
        borderLeft: layer.style.borderLeftColor
          ? `10px solid ${layer.style.borderLeftColor}`
          : undefined,
        color: layer.style.color,
        fontFamily: layer.style.fontFamily,
        fontSize: layer.style.fontSize,
        lineHeight: layer.style.lineHeight,
        fontWeight: layer.style.weight,
        textAlign: layer.style.align ?? "left",
        textTransform: layer.style.textTransform,
        textShadow: layer.style.shadow ? textShadowForLayer(layer) : undefined,
        WebkitTextStroke:
          layer.style.strokeColor && layer.style.strokeWidth
            ? `${layer.style.strokeWidth}px ${layer.style.strokeColor}`
            : undefined,
        whiteSpace: layer.style.whiteSpace,
        overflow: "hidden",
      }}
    >
      {layer.style.accentColor && layer.id === "opening-caption"
        ? accentFirstWord(layer.text, layer.style.accentColor)
        : emphasize(layer.text, layer.emphasis)}
    </FrameBox>
  );
}

function textShadowForLayer(layer: TextOverlayLayerModel): string {
  if (layer.id === "opening-caption") {
    return "0 10px 24px rgba(0,0,0,0.38)";
  }
  return "0 8px 0 rgba(0,0,0,0.95), 0 18px 32px rgba(0,0,0,0.35)";
}

function accentFirstWord(text: string, accent: string) {
  const [first, ...rest] = text.split(/\s+/);
  return (
    <>
      <span style={{ color: accent }}>{first}</span>
      {rest.length > 0 ? ` ${rest.join(" ")}` : ""}
    </>
  );
}

function emphasize(
  text: string,
  emphasis: TextOverlayLayerModel["emphasis"],
) {
  if (!emphasis) return text;
  const index = text.toLowerCase().indexOf(emphasis.phrase.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <span style={{ color: emphasis.color }}>
        {text.slice(index, index + emphasis.phrase.length)}
      </span>
      {text.slice(index + emphasis.phrase.length)}
    </>
  );
}

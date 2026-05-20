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
        fontSize: layer.style.fontSize,
        lineHeight: layer.style.lineHeight,
        fontWeight: layer.style.weight,
        textAlign: layer.style.align ?? "left",
        textTransform: layer.style.textTransform,
        textShadow: layer.style.shadow
          ? "0 8px 28px rgba(0,0,0,0.65)"
          : undefined,
        overflow: "hidden",
      }}
    >
      {layer.style.accentColor && layer.id === "opening-caption"
        ? accentFirstWord(layer.text, layer.style.accentColor)
        : emphasize(layer.text, layer.emphasis)}
    </FrameBox>
  );
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

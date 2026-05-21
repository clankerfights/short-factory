import type { CalloutLayer as CalloutLayerModel } from "../../lib/edit-model";
import { FrameBox } from "./FrameBox";

export function CalloutLayer({ layer }: { layer: CalloutLayerModel }) {
  return (
    <FrameBox
      box={layer.box}
      style={{
        padding: "20px 24px",
        background: layer.style.background ?? "rgba(5,7,10,0.82)",
        color: layer.style.color,
        border: layer.style.borderColor
          ? `4px solid ${layer.style.borderColor}`
          : undefined,
        borderLeft: layer.style.borderLeftColor
          ? `10px solid ${layer.style.borderLeftColor}`
          : undefined,
        fontSize: layer.style.fontSize,
        lineHeight: layer.style.lineHeight,
        fontWeight: layer.style.weight,
        textAlign: layer.style.align ?? "left",
        textTransform: layer.style.textTransform,
        textShadow: layer.style.shadow ? "0 8px 28px rgba(0,0,0,0.65)" : undefined,
        overflow: "hidden",
      }}
    >
      {layer.text}
    </FrameBox>
  );
}

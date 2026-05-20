import type { CtaLayer as CtaLayerModel } from "../../lib/edit-model";
import { FrameBox } from "./FrameBox";

export function CtaLayer({ layer }: { layer: CtaLayerModel }) {
  return (
    <FrameBox
      box={layer.box}
      style={{
        background: layer.style.background,
        color: layer.style.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: layer.style.fontSize,
        fontWeight: layer.style.weight,
      }}
    >
      {layer.text}
    </FrameBox>
  );
}

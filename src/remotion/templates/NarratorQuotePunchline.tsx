import { AbsoluteFill } from "remotion";
import { buildNarratorQuoteComposition } from "../../lib/composition-builder";
import { EditLayerRenderer } from "../components/EditLayerRenderer";
import type { RemotionFactoryProps } from "../types";

export function NarratorQuotePunchline({
  baseVideoSrc,
  variant,
}: RemotionFactoryProps) {
  const composition =
    variant.composition ?? buildNarratorQuoteComposition(variant);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: composition.canvas.background,
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      {composition.layers.map((layer) => (
        <EditLayerRenderer
          key={layer.id}
          layer={layer}
          baseVideoSrc={baseVideoSrc}
        />
      ))}
    </AbsoluteFill>
  );
}

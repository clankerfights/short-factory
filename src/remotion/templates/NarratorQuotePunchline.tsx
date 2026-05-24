import { AbsoluteFill } from "remotion";
import { buildNarratorQuoteComposition } from "../../lib/composition-builder";
import { sortedLayers } from "../../lib/composition-utils";
import { EditLayerRenderer } from "../components/EditLayerRenderer";
import type { RemotionFactoryProps } from "../types";

export function NarratorQuotePunchline({
  baseVideoSrc,
  baseVideoTiming,
  variant,
}: RemotionFactoryProps) {
  const composition =
    variant.composition ?? buildNarratorQuoteComposition(variant);
  const videoStartFrame =
    composition.layers.find((candidate) => candidate.kind === "video-source")
      ?.time.start ?? 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: composition.canvas.background,
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      {sortedLayers(composition.layers).map((layer) => (
        <EditLayerRenderer
          key={layer.id}
          layer={layer}
          baseVideoSrc={baseVideoSrc}
          baseVideoTiming={baseVideoTiming}
          timelineEdits={composition.timelineEdits}
          canvas={composition.canvas}
          videoStartFrame={videoStartFrame}
          rawDurationFrames={
            composition.layers.find((candidate) => candidate.kind === "video-source")
              ?.time.duration
          }
        />
      ))}
    </AbsoluteFill>
  );
}

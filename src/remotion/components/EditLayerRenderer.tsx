import { Sequence } from "remotion";
import type { EditLayer } from "../../lib/edit-model";
import { CtaLayer } from "./CtaLayer";
import { SpeakerBadgeLayer } from "./SpeakerBadgeLayer";
import { TextOverlayLayer } from "./TextOverlayLayer";
import { VideoSourceLayer } from "./VideoSourceLayer";

export function EditLayerRenderer({
  layer,
  baseVideoSrc,
}: {
  layer: EditLayer;
  baseVideoSrc: string;
}) {
  return (
    <Sequence from={layer.time.start} durationInFrames={layer.time.duration}>
      {renderLayer(layer, baseVideoSrc)}
    </Sequence>
  );
}

function renderLayer(layer: EditLayer, baseVideoSrc: string) {
  if (layer.kind === "video-source") {
    return <VideoSourceLayer layer={layer} baseVideoSrc={baseVideoSrc} />;
  }
  if (layer.kind === "text") return <TextOverlayLayer layer={layer} />;
  if (layer.kind === "speaker-badge") return <SpeakerBadgeLayer layer={layer} />;
  return <CtaLayer layer={layer} />;
}

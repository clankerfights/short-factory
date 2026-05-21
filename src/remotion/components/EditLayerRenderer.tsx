import { Sequence } from "remotion";
import type { EditComposition, EditLayer } from "../../lib/edit-model";
import {
  normalizeFreezes,
  sourceDurationForTimelineEdits,
} from "../../lib/composition-utils";
import { AudioLayer } from "./AudioLayer";
import { CalloutLayer } from "./CalloutLayer";
import { CtaLayer } from "./CtaLayer";
import { ImageLayer } from "./ImageLayer";
import { ShapeLayer } from "./ShapeLayer";
import { SpeakerBadgeLayer } from "./SpeakerBadgeLayer";
import { TextOverlayLayer } from "./TextOverlayLayer";
import { VideoSourceLayer } from "./VideoSourceLayer";
import { ZoomLayer } from "./ZoomLayer";

export function EditLayerRenderer({
  layer,
  baseVideoSrc,
  timelineEdits,
  canvas,
  rawDurationFrames,
}: {
  layer: EditLayer;
  baseVideoSrc: string;
  timelineEdits?: EditComposition["timelineEdits"];
  canvas: EditComposition["canvas"];
  rawDurationFrames?: number;
}) {
  if (layer.hidden) return null;
  const duration =
    layer.kind === "video-source"
      ? sourceDurationForTimelineEdits(layer.time.duration, timelineEdits) +
        normalizeFreezes(
          timelineEdits?.freezes,
          sourceDurationForTimelineEdits(layer.time.duration, timelineEdits),
        ).reduce(
          (total, freeze) => total + freeze.durationFrames,
          0,
        )
      : layer.time.duration;
  return (
    <Sequence from={layer.time.start} durationInFrames={duration}>
      {renderLayer(layer, baseVideoSrc, timelineEdits, canvas, rawDurationFrames)}
    </Sequence>
  );
}

function renderLayer(
  layer: EditLayer,
  baseVideoSrc: string,
  timelineEdits?: EditComposition["timelineEdits"],
  canvas?: EditComposition["canvas"],
  rawDurationFrames?: number,
) {
  if (layer.kind === "video-source") {
    return (
      <VideoSourceLayer
        layer={layer}
        baseVideoSrc={baseVideoSrc}
        timelineEdits={timelineEdits}
      />
    );
  }
  if (layer.kind === "text") return <TextOverlayLayer layer={layer} />;
  if (layer.kind === "speaker-badge") return <SpeakerBadgeLayer layer={layer} />;
  if (layer.kind === "image") return <ImageLayer layer={layer} />;
  if (layer.kind === "shape") return <ShapeLayer layer={layer} />;
  if (layer.kind === "zoom" && canvas) {
    return (
      <ZoomLayer
        layer={layer}
        baseVideoSrc={baseVideoSrc}
        timelineEdits={timelineEdits}
        canvas={canvas}
        rawDurationFrames={rawDurationFrames}
      />
    );
  }
  if (layer.kind === "zoom") return null;
  if (layer.kind === "callout") return <CalloutLayer layer={layer} />;
  if (layer.kind === "audio-file" || layer.kind === "tts") {
    return <AudioLayer layer={layer} />;
  }
  return <CtaLayer layer={layer} />;
}

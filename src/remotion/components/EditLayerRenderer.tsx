import { Sequence } from "remotion";
import type { BaseRecordingTiming, EditComposition, EditLayer } from "../../lib/edit-model";
import { outputDurationForTimelineEdits } from "../../lib/composition-utils";
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
  baseVideoTiming,
  timelineEdits,
  canvas,
  videoStartFrame,
  rawDurationFrames,
}: {
  layer: EditLayer;
  baseVideoSrc: string;
  baseVideoTiming?: BaseRecordingTiming;
  timelineEdits?: EditComposition["timelineEdits"];
  canvas: EditComposition["canvas"];
  videoStartFrame: number;
  rawDurationFrames?: number;
}) {
  if (layer.hidden) return null;
  const duration =
    layer.kind === "video-source"
      ? outputDurationForTimelineEdits(layer.time.duration, timelineEdits)
      : layer.time.duration;
  return (
    <Sequence from={layer.time.start} durationInFrames={duration}>
      {renderLayer(
        layer,
        baseVideoSrc,
        baseVideoTiming,
        timelineEdits,
        canvas,
        videoStartFrame,
        rawDurationFrames,
      )}
    </Sequence>
  );
}

function renderLayer(
  layer: EditLayer,
  baseVideoSrc: string,
  baseVideoTiming?: BaseRecordingTiming,
  timelineEdits?: EditComposition["timelineEdits"],
  canvas?: EditComposition["canvas"],
  videoStartFrame = 0,
  rawDurationFrames?: number,
) {
  if (layer.kind === "video-source") {
    return (
      <VideoSourceLayer
        layer={layer}
        baseVideoSrc={baseVideoSrc}
        baseVideoTiming={baseVideoTiming}
        timelineEdits={timelineEdits}
        fps={canvas?.fps}
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
        baseVideoTiming={baseVideoTiming}
        timelineEdits={timelineEdits}
        canvas={canvas}
        videoStartFrame={videoStartFrame}
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

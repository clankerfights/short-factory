import { interpolate, useCurrentFrame } from "remotion";
import type {
  BaseRecordingTiming,
  EditComposition,
  VideoSourceLayer as VideoSourceLayerModel,
} from "../../lib/edit-model";
import { outputDurationForTimelineEdits } from "../../lib/composition-utils";
import { TimelineVideo } from "./TimelineVideo";

export function VideoSourceLayer({
  layer,
  baseVideoSrc,
  baseVideoTiming,
  timelineEdits,
  fps = 30,
}: {
  layer: VideoSourceLayerModel;
  baseVideoSrc: string;
  baseVideoTiming?: BaseRecordingTiming;
  timelineEdits?: EditComposition["timelineEdits"];
  fps?: number;
}) {
  const frame = useCurrentFrame();
  const scale = layer.animation?.scale
    ? interpolate(
        frame,
        [layer.time.start, layer.time.start + layer.time.duration],
        [layer.animation.scale.from, layer.animation.scale.to],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : layer.transform?.scale ?? 1;

  const style = {
    position: "absolute" as const,
    left: layer.box.x,
    top: layer.box.y,
    width: layer.box.width,
    height: layer.box.height,
    objectFit: layer.fit,
    opacity: layer.filters?.opacity ?? layer.transform?.opacity ?? 1,
    transform: `scale(${scale}) rotate(${layer.transform?.rotateDeg ?? 0}deg)`,
    filter: filterString(layer.filters),
  };

  return (
    <TimelineVideo
      baseVideoSrc={baseVideoSrc}
      baseVideoTiming={baseVideoTiming}
      timelineEdits={timelineEdits}
      rawSourceDurationFrames={layer.time.duration}
      outputDurationFrames={outputDurationForTimelineEdits(layer.time.duration, timelineEdits)}
      fps={fps}
      style={style}
    />
  );
}

function filterString(filters: VideoSourceLayerModel["filters"]): string | undefined {
  if (!filters) return undefined;
  const parts = [
    filters.blurPx !== undefined ? `blur(${filters.blurPx}px)` : null,
    filters.contrast !== undefined ? `contrast(${filters.contrast})` : null,
    filters.saturate !== undefined ? `saturate(${filters.saturate})` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

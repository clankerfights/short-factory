import { OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { EditComposition, ZoomLayer as ZoomLayerModel } from "../../lib/edit-model";
import {
  sourceDurationForTimelineEdits,
  sourceFrameForOutputFrame,
  sourceFrameToRawFrame,
} from "../../lib/composition-utils";

export function ZoomLayer({
  layer,
  baseVideoSrc,
  timelineEdits,
  canvas,
  rawDurationFrames,
}: {
  layer: ZoomLayerModel;
  baseVideoSrc: string;
  timelineEdits?: EditComposition["timelineEdits"];
  canvas: EditComposition["canvas"];
  rawDurationFrames?: number;
}) {
  const frame = useCurrentFrame();
  const source = baseVideoSrc.startsWith("http")
    ? baseVideoSrc
    : staticFile(baseVideoSrc);
  const duration = Math.max(1, layer.time.duration);
  const localFrame = Math.max(0, frame);
  const startScale = canvas.width / layer.box.width;
  const startTranslateX = -layer.box.x * startScale;
  const startTranslateY = -layer.box.y * startScale;
  const easing = easingName(layer.easing);
  const scale = interpolate(localFrame, [0, duration], [startScale, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
  const translateX = interpolate(localFrame, [0, duration], [startTranslateX, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
  const translateY = interpolate(localFrame, [0, duration], [startTranslateY, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
  const rawDuration = rawDurationFrames ?? canvas.durationFrames;
  const trimmedDuration = sourceDurationForTimelineEdits(rawDuration, timelineEdits);
  const sourceStart = sourceFrameForOutputFrame(
    layer.time.start,
    timelineEdits?.freezes,
    trimmedDuration,
  );
  const rawStart = sourceFrameToRawFrame(
    sourceStart,
    timelineEdits?.trim,
    rawDuration,
  );

  return (
    <OffthreadVideo
      src={source}
      muted
      startFrom={rawStart}
      style={{
        position: "absolute",
        inset: 0,
        width: canvas.width,
        height: canvas.height,
        objectFit: "cover",
        transformOrigin: "0 0",
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
      }}
    />
  );
}

function easingName(name: ZoomLayerModel["easing"]) {
  if (name === "linear") return (value: number) => value;
  if (name === "easeInOut") {
    return (value: number) => (value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2);
  }
  return (value: number) => 1 - (1 - value) * (1 - value);
}

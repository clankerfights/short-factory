import { interpolate, useCurrentFrame } from "remotion";
import type {
  BaseRecordingTiming,
  EditComposition,
  ZoomLayer as ZoomLayerModel,
} from "../../lib/edit-model";
import { TimelineVideo } from "./TimelineVideo";

export function ZoomLayer({
  layer,
  baseVideoSrc,
  baseVideoTiming,
  timelineEdits,
  canvas,
  videoStartFrame,
  rawDurationFrames,
}: {
  layer: ZoomLayerModel;
  baseVideoSrc: string;
  baseVideoTiming?: BaseRecordingTiming;
  timelineEdits?: EditComposition["timelineEdits"];
  canvas: EditComposition["canvas"];
  videoStartFrame: number;
  rawDurationFrames?: number;
}) {
  const frame = useCurrentFrame();
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

  return (
    <TimelineVideo
      baseVideoSrc={baseVideoSrc}
      baseVideoTiming={baseVideoTiming}
      timelineEdits={timelineEdits}
      rawSourceDurationFrames={rawDuration}
      outputStartFrame={Math.max(0, layer.time.start - videoStartFrame)}
      outputDurationFrames={duration}
      fps={canvas.fps}
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

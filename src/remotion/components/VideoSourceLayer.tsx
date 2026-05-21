import { Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import type {
  EditComposition,
  VideoSourceLayer as VideoSourceLayerModel,
} from "../../lib/edit-model";
import {
  normalizeFreezes,
  normalizeTrim,
  sourceDurationForTimelineEdits,
} from "../../lib/composition-utils";

export function VideoSourceLayer({
  layer,
  baseVideoSrc,
  timelineEdits,
}: {
  layer: VideoSourceLayerModel;
  baseVideoSrc: string;
  timelineEdits?: EditComposition["timelineEdits"];
}) {
  const frame = useCurrentFrame();
  const source = baseVideoSrc.startsWith("http")
    ? baseVideoSrc
    : staticFile(baseVideoSrc);
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
  const trim = normalizeTrim(timelineEdits?.trim, layer.time.duration);
  const sourceDuration = sourceDurationForTimelineEdits(layer.time.duration, timelineEdits);
  const freezes = normalizeFreezes(timelineEdits?.freezes, sourceDuration);

  if (freezes.length === 0) {
    return <OffthreadVideo src={source} muted startFrom={trim.startFrame} style={style} />;
  }

  let sourceCursor = 0;
  let outputCursor = 0;
  const segments = [];

  for (const freeze of freezes) {
    const normalDuration = Math.max(0, freeze.atFrame - sourceCursor + 1);
    if (normalDuration > 0) {
      segments.push(
        <Sequence key={`normal-${freeze.id}`} from={outputCursor} durationInFrames={normalDuration}>
          <OffthreadVideo src={source} muted startFrom={trim.startFrame + sourceCursor} style={style} />
        </Sequence>,
      );
      outputCursor += normalDuration;
    }

    segments.push(
      <Sequence key={freeze.id} from={outputCursor} durationInFrames={freeze.durationFrames}>
        <Freeze frame={0}>
          <OffthreadVideo src={source} muted startFrom={trim.startFrame + freeze.atFrame} style={style} />
        </Freeze>
      </Sequence>,
    );
    outputCursor += freeze.durationFrames;
    sourceCursor = Math.min(sourceDuration, freeze.atFrame + 1);
  }

  const tailDuration = Math.max(0, sourceDuration - sourceCursor);
  if (tailDuration > 0) {
    segments.push(
      <Sequence key="normal-tail" from={outputCursor} durationInFrames={tailDuration}>
        <OffthreadVideo src={source} muted startFrom={trim.startFrame + sourceCursor} style={style} />
      </Sequence>,
    );
  }

  return <>{segments}</>;
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

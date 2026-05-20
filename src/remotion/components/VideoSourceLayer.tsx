import { OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { VideoSourceLayer as VideoSourceLayerModel } from "../../lib/edit-model";

export function VideoSourceLayer({
  layer,
  baseVideoSrc,
}: {
  layer: VideoSourceLayerModel;
  baseVideoSrc: string;
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

  return (
    <OffthreadVideo
      src={source}
      muted
      style={{
        position: "absolute",
        left: layer.box.x,
        top: layer.box.y,
        width: layer.box.width,
        height: layer.box.height,
        objectFit: layer.fit,
        opacity: layer.filters?.opacity ?? layer.transform?.opacity ?? 1,
        transform: `scale(${scale}) rotate(${layer.transform?.rotateDeg ?? 0}deg)`,
        filter: filterString(layer.filters),
      }}
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

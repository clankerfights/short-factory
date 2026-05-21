import { Img, staticFile } from "remotion";
import type { ImageLayer as ImageLayerModel } from "../../lib/edit-model";

export function ImageLayer({ layer }: { layer: ImageLayerModel }) {
  const src = layer.src.startsWith("http") ? layer.src : staticFile(layer.src);
  const scale = layer.transform?.scale ?? 1;
  const scaleX = layer.flipX ? -scale : scale;
  return (
    <Img
      src={src}
      style={{
        position: "absolute",
        left: layer.box.x,
        top: layer.box.y,
        width: layer.box.width,
        height: layer.box.height,
        objectFit: layer.fit,
        opacity: layer.opacity ?? layer.transform?.opacity ?? 1,
        transform: `scale(${scaleX}, ${scale}) rotate(${layer.transform?.rotateDeg ?? 0}deg)`,
      }}
    />
  );
}

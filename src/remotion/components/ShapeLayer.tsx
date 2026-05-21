import type { ShapeLayer as ShapeLayerModel } from "../../lib/edit-model";
import { FrameBox } from "./FrameBox";

export function ShapeLayer({ layer }: { layer: ShapeLayerModel }) {
  if (layer.shape === "line" || layer.shape === "arrow") {
    const stroke = layer.style.stroke ?? layer.style.fill;
    const strokeWidth = layer.style.strokeWidth ?? 8;
    const markerId = `${layer.id}-arrow`;
    return (
      <svg
        style={{
          position: "absolute",
          left: layer.box.x,
          top: layer.box.y,
          width: layer.box.width,
          height: layer.box.height,
          overflow: "visible",
          opacity: layer.style.opacity ?? 1,
        }}
        viewBox={`0 0 ${layer.box.width} ${layer.box.height}`}
      >
        {layer.shape === "arrow" ? (
          <defs>
            <marker
              id={markerId}
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M2,2 L10,6 L2,10 Z" fill={stroke} />
            </marker>
          </defs>
        ) : null}
        <line
          x1="0"
          y1={layer.box.height / 2}
          x2={layer.box.width}
          y2={layer.box.height / 2}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd={layer.shape === "arrow" ? `url(#${markerId})` : undefined}
        />
      </svg>
    );
  }

  return (
    <FrameBox
      box={layer.box}
      style={{
        background: layer.style.fill,
        border: layer.style.stroke
          ? `${layer.style.strokeWidth ?? 2}px solid ${layer.style.stroke}`
          : undefined,
        borderRadius:
          layer.shape === "ellipse" ? "9999px" : layer.style.radius ?? 0,
        opacity: layer.style.opacity ?? 1,
      }}
    >
      {null}
    </FrameBox>
  );
}

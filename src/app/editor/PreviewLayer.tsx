import type { CSSProperties, PointerEvent, ReactNode } from "react";
import type {
  EditComposition,
  EditLayer,
  ShapeLayer,
} from "../../lib/edit-model";

export function PreviewLayer({
  layer,
  canvas,
  active,
  onPointerDown,
}: {
  layer: EditLayer;
  canvas: EditComposition["canvas"];
  active: boolean;
  onPointerDown: (
    mode: "move" | "resize",
    event: PointerEvent<HTMLElement>,
  ) => void;
}) {
  if (layer.hidden || layer.kind === "audio-file" || layer.kind === "tts") return null;
  const box = layer.box;
  if (!box || layer.kind === "video-source") return null;

  const style: CSSProperties = {
    position: "absolute",
    left: `${(box.x / canvas.width) * 100}%`,
    top: `${(box.y / canvas.height) * 100}%`,
    width: `${(box.width / canvas.width) * 100}%`,
    height: `${(box.height / canvas.height) * 100}%`,
    zIndex: layer.zIndex ?? 0,
  };

  const wrap = (children: ReactNode) => (
    <div
      className={`draggableOverlay ${active ? "active" : ""}`}
      style={style}
      onPointerDown={(event) => onPointerDown("move", event)}
    >
      {children}
      {active ? (
        <button
          className="resizeHandle"
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown("resize", event);
          }}
          aria-label="Resize layer"
        />
      ) : null}
    </div>
  );

  if (layer.kind === "shape") return wrap(<PreviewShape layer={layer} />);
  if (layer.kind === "zoom") {
    return wrap(
      <div className="previewZoomFrame">
        <span>Zoom start</span>
      </div>,
    );
  }
  if (layer.kind === "image") {
    const previewUrl = imagePreviewUrl(layer.src);
    return wrap(
      previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: layer.fit }}
          className={layer.flipX ? "flippedImagePreview" : undefined}
        />
      ) : (
        <div className="previewImage">image</div>
      ),
    );
  }
  if (layer.kind === "cta") {
    return wrap(
      <div
        style={{
          width: "100%",
          height: "100%",
          background: layer.style.background,
          color: layer.style.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: canvasUnit(layer.style.fontSize, canvas),
          fontWeight: layer.style.weight,
        }}
      >
        {layer.text}
      </div>,
    );
  }
  if ("text" in layer && "style" in layer) {
    return wrap(
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: layer.style.background
            ? `${canvasUnit(24, canvas)} ${canvasUnit(28, canvas)}`
            : undefined,
          background: layer.style.background,
          color: layer.style.color,
          fontFamily: layer.style.fontFamily,
          fontSize: canvasUnit(layer.style.fontSize, canvas),
          fontWeight: layer.style.weight,
          lineHeight: layer.style.lineHeight,
          textTransform: layer.style.textTransform,
          textAlign: layer.style.align,
          textShadow: layer.style.shadow
            ? `0 ${canvasUnit(8, canvas)} 0 rgba(0,0,0,0.95), 0 ${canvasUnit(18, canvas)} ${canvasUnit(32, canvas)} rgba(0,0,0,0.35)`
            : undefined,
          WebkitTextStroke:
            layer.style.strokeColor && layer.style.strokeWidth
              ? `${canvasUnit(layer.style.strokeWidth, canvas)} ${layer.style.strokeColor}`
              : undefined,
          whiteSpace: layer.style.whiteSpace,
          overflow: "hidden",
        }}
      >
        {layer.text}
      </div>,
    );
  }
  if (layer.kind === "speaker-badge") {
    return wrap(
      <div className="previewBadge" style={{ borderColor: layer.accentColor }}>
        {layer.speaker}
      </div>,
    );
  }
  return null;
}

function canvasUnit(value: number, canvas: EditComposition["canvas"]): string {
  return `${(value / canvas.width) * 100}cqw`;
}

function PreviewShape({ layer }: { layer: ShapeLayer }) {
  if (layer.shape === "line" || layer.shape === "arrow") {
    const stroke = layer.style.stroke ?? layer.style.fill;
    return (
      <svg className="previewShapeSvg" viewBox={`0 0 ${layer.box.width} ${layer.box.height}`}>
        {layer.shape === "arrow" ? (
          <defs>
            <marker
              id={`${layer.id}-preview`}
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
          strokeWidth={layer.style.strokeWidth ?? 8}
          strokeLinecap="round"
          markerEnd={layer.shape === "arrow" ? `url(#${layer.id}-preview)` : undefined}
        />
      </svg>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: layer.style.fill,
        border: layer.style.stroke
          ? `${layer.style.strokeWidth ?? 2}px solid ${layer.style.stroke}`
          : undefined,
        borderRadius: layer.shape === "ellipse" ? "50%" : layer.style.radius ?? 0,
        opacity: layer.style.opacity ?? 1,
      }}
    />
  );
}

function imagePreviewUrl(src: string): string | null {
  if (src.startsWith("http") || src.startsWith("/")) return src;
  if (src.startsWith("assets/")) return `/api/assets/${src.slice("assets/".length)}`;
  return null;
}

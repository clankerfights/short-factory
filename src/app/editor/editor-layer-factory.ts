import type {
  AudioFileLayer,
  CtaLayer,
  ImageLayer,
  ShapeLayer,
  TextOverlayLayer,
  TtsLayer,
  ZoomLayer,
} from "../../lib/edit-model";
import type { JobAsset } from "../../lib/asset-store";
import { DEFAULT_TTS_INSTRUCTIONS } from "../../lib/voice-registry";

export function createImageLayer(input: {
  name: string;
  src: string;
  startFrame: number;
}): ImageLayer {
  return {
    id: uniqueLayerId("image"),
    kind: "image",
    name: input.name,
    time: { start: input.startFrame, duration: 120 },
    box: { x: 90, y: 560, width: 900, height: 560 },
    zIndex: 35,
    src: input.src,
    fit: "contain",
    flipX: false,
  };
}

export function createTextLayer(input: {
  id?: string;
  name?: string;
  text?: string;
  startFrame: number;
  preset?: "setup" | "quote" | "plain";
}): TextOverlayLayer {
  const preset = input.preset ?? "plain";
  return {
    id: input.id ?? uniqueLayerId("text"),
    kind: "text",
    name: input.name ?? (preset === "setup" ? "Setup text" : preset === "quote" ? "Quote" : "Text"),
    time: {
      start: input.startFrame,
      duration: preset === "quote" ? 180 : 120,
    },
    box:
      preset === "quote"
        ? { x: 74, y: 620, width: 932, height: 260 }
        : { x: 74, y: 120, width: 932, height: 220 },
    zIndex: preset === "quote" ? 30 : 40,
    text: input.text ?? (preset === "quote" ? "Quote text goes here." : "Text goes here."),
    style: {
      fontSize: preset === "quote" ? 54 : 72,
      lineHeight: 1.04,
      fontFamily:
        preset === "setup"
          ? 'Montserrat, "Proxima Nova", "TikTok Sans", Arial, system-ui, sans-serif'
          : undefined,
      weight: preset === "setup" ? 700 : 950,
      color: preset === "setup" ? "#090909" : "#ffffff",
      background: preset === "quote" ? "rgba(5, 7, 10, 0.72)" : undefined,
      textTransform: preset === "setup" ? "uppercase" : "none",
      shadow: true,
      align: "left",
    },
  };
}

export function createCtaLayer(startFrame: number, durationFrames: number): CtaLayer {
  return {
    id: "cta",
    kind: "cta",
    name: "Bottom ad",
    time: { start: startFrame, duration: Math.max(1, durationFrames - startFrame) },
    box: { x: 76, y: 1708, width: 928, height: 92 },
    zIndex: 80,
    text: "Watch AI battle live at clankerfights.ai",
    style: {
      background: "rgba(0, 224, 184, 0.92)",
      color: "#03100e",
      fontSize: 38,
      weight: 950,
    },
  };
}

export function createAudioLayer(asset: JobAsset, startFrame: number): AudioFileLayer {
  return {
    id: uniqueLayerId("audio"),
    kind: "audio-file",
    name: asset.name,
    time: { start: startFrame, duration: 150 },
    zIndex: 95,
    src: asset.relativePath,
    volume: 1,
  };
}

export function createTtsLayer(startFrame: number): TtsLayer {
  return {
    id: uniqueLayerId("tts"),
    kind: "tts",
    name: "Voiceover",
    time: { start: startFrame, duration: 120 },
    zIndex: 100,
    text: "Say anything here.",
    voice: "coral",
    instructions: DEFAULT_TTS_INSTRUCTIONS,
    volume: 1,
  };
}

export function createShapeLayer(
  shape: ShapeLayer["shape"],
  startFrame: number,
  durationFrames: number,
): ShapeLayer {
  return {
    id: uniqueLayerId("shape"),
    kind: "shape",
    name: shapeLabel(shape),
    time: { start: startFrame, duration: Math.min(120, durationFrames) },
    box:
      shape === "line" || shape === "arrow"
        ? { x: 210, y: 820, width: 660, height: 80 }
        : { x: 220, y: 580, width: 640, height: 360 },
    zIndex: 45,
    shape,
    style: {
      fill: shape === "rect" || shape === "ellipse" ? "rgba(255, 230, 107, 0.2)" : "transparent",
      stroke: "#ffe66b",
      strokeWidth: 10,
      radius: 18,
      opacity: 1,
    },
  };
}

export function createZoomLayer(startFrame: number, canvas: { width: number; height: number }): ZoomLayer {
  const width = Math.round(canvas.width * 0.52);
  const height = Math.round(width * (canvas.height / canvas.width));
  return {
    id: uniqueLayerId("zoom"),
    kind: "zoom",
    name: "Zoom out",
    time: { start: startFrame, duration: 90 },
    box: {
      x: Math.round((canvas.width - width) / 2),
      y: Math.round((canvas.height - height) / 2),
      width,
      height,
    },
    zIndex: 4,
    easing: "easeOut",
  };
}

export function shapeLabel(shape: ShapeLayer["shape"]): string {
  if (shape === "rect") return "Box";
  if (shape === "ellipse") return "Circle";
  if (shape === "line") return "Line";
  return "Arrow";
}

function uniqueLayerId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

import { Audio, staticFile } from "remotion";
import type { AudioFileLayer, TtsLayer } from "../../lib/edit-model";

type AudioLayerModel = AudioFileLayer | TtsLayer;

export function AudioLayer({ layer }: { layer: AudioLayerModel }) {
  const src = layer.kind === "tts" ? layer.src : layer.src;
  if (!src) return null;
  return (
    <Audio
      src={remotionAudioSrc(src)}
      volume={layer.volume}
    />
  );
}

function remotionAudioSrc(src: string): string {
  if (src.startsWith("http")) return src;
  if (src.startsWith("/") && !isRemotionLocalAsset(src)) return src;
  return staticFile(remotionAssetPath(src));
}

export function remotionAssetPath(src: string): string {
  const normalized = src.replace(/^\/+/, "");
  if (normalized.startsWith("public/sound-effects/")) {
    return `assets/${normalized.slice("public/".length)}`;
  }
  if (normalized.startsWith("sound-effects/")) return `assets/${normalized}`;
  return normalized;
}

function isRemotionLocalAsset(src: string): boolean {
  const normalized = src.replace(/^\/+/, "");
  return (
    normalized.startsWith("public/sound-effects/") ||
    normalized.startsWith("sound-effects/") ||
    normalized.startsWith("assets/")
  );
}

import type {
  EditComposition,
  EditLayer,
  FreezeFrameEdit,
  PlaybackSpeedEdit,
  TrimFrameEdit,
} from "./edit-model";
import { buildNarratorQuoteComposition } from "./composition-builder";
import type { EditRecipeVariant, FactoryJob } from "./types";

export function compositionForVariant(variant: EditRecipeVariant): EditComposition {
  return ensureUniqueCompositionIds(
    variant.composition ?? buildNarratorQuoteComposition(variant),
  );
}

export function sortedLayers(layers: EditLayer[]): EditLayer[] {
  return [...layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

export function ensureUniqueCompositionIds(
  composition: EditComposition,
): EditComposition {
  return {
    ...composition,
    layers: uniquifyIds(composition.layers, "layer"),
    timelineEdits: composition.timelineEdits
      ? {
          ...composition.timelineEdits,
          freezes: composition.timelineEdits.freezes
            ? uniquifyIds(composition.timelineEdits.freezes, "freeze")
            : composition.timelineEdits.freezes,
        }
      : composition.timelineEdits,
  };
}

export function applyCompositionToJob(
  job: FactoryJob,
  variantId: string,
  composition: EditComposition,
): FactoryJob {
  const variant = job.editRecipe.variants.find(
    (candidate) => candidate.variantId === variantId,
  );
  if (!variant) {
    throw new Error(`No edit recipe variant found for ${variantId}.`);
  }

  variant.composition = composition;
  return job;
}

export function upsertCompositionLayer(
  composition: EditComposition,
  layer: EditLayer,
): EditComposition {
  const index = composition.layers.findIndex((candidate) => candidate.id === layer.id);
  if (index < 0) {
    return { ...composition, layers: [...composition.layers, layer] };
  }

  const layers = [...composition.layers];
  layers[index] = layer;
  return { ...composition, layers };
}

export function sourceDurationFrames(composition: EditComposition): number {
  return sourceDurationForTimelineEdits(
    rawSourceDurationFrames(composition),
    composition.timelineEdits,
  );
}

export function rawSourceDurationFrames(composition: EditComposition): number {
  const baseLayer = composition.layers.find((layer) => layer.kind === "video-source");
  return baseLayer?.time.duration ?? composition.canvas.durationFrames;
}

export function sourceDurationForTimelineEdits(
  rawDurationFrames: number,
  timelineEdits?: EditComposition["timelineEdits"],
): number {
  const trim = normalizeTrim(timelineEdits?.trim, rawDurationFrames);
  return trim.endFrame - trim.startFrame;
}

export function outputDurationForTimelineEdits(
  rawDurationFrames: number,
  timelineEdits?: EditComposition["timelineEdits"],
): number {
  const sourceDuration = sourceDurationForTimelineEdits(rawDurationFrames, timelineEdits);
  const freezes = normalizeFreezes(timelineEdits?.freezes, sourceDuration);
  const speed = normalizePlaybackSpeed(timelineEdits?.playback);
  let outputDuration = 0;
  let sourceCursor = 0;

  for (const freeze of freezes) {
    outputDuration += sourceFramesToOutputFrames(
      Math.max(0, freeze.atFrame - sourceCursor + 1),
      speed,
    );
    outputDuration += freeze.durationFrames;
    sourceCursor = Math.min(sourceDuration, freeze.atFrame + 1);
  }

  outputDuration += sourceFramesToOutputFrames(
    Math.max(0, sourceDuration - sourceCursor),
    speed,
  );
  return Math.max(1, outputDuration);
}

export function trimWindowForComposition(composition: EditComposition): TrimFrameEdit {
  return normalizeTrim(composition.timelineEdits?.trim, rawSourceDurationFrames(composition));
}

export function freezeDurationFrames(composition: EditComposition): number {
  return (composition.timelineEdits?.freezes ?? []).reduce(
    (total, freeze) => total + freeze.durationFrames,
    0,
  );
}

export function isLayerActiveAtFrame(layer: EditLayer, frame: number): boolean {
  if (layer.hidden) return false;
  return frame >= layer.time.start && frame < layer.time.start + layer.time.duration;
}

export function sourceFrameForOutputFrame(
  outputFrame: number,
  freezes: FreezeFrameEdit[] | undefined,
  sourceDuration: number,
  playback?: PlaybackSpeedEdit,
): number {
  const normalized = normalizeFreezes(freezes, sourceDuration);
  const speed = normalizePlaybackSpeed(playback);
  let outputCursor = 0;
  let sourceCursor = 0;

  for (const freeze of normalized) {
    const sourceFrames = Math.max(0, freeze.atFrame - sourceCursor + 1);
    const normalDuration = sourceFramesToOutputFrames(sourceFrames, speed);
    if (outputFrame < outputCursor + normalDuration) {
      return clampFrame(
        sourceCursor + Math.floor((outputFrame - outputCursor) * speed),
        sourceDuration,
      );
    }

    outputCursor += normalDuration;
    if (outputFrame < outputCursor + freeze.durationFrames) {
      return freeze.atFrame;
    }

    outputCursor += freeze.durationFrames;
    sourceCursor = Math.min(sourceDuration, freeze.atFrame + 1);
  }

  return clampFrame(
    sourceCursor + Math.floor((outputFrame - outputCursor) * speed),
    sourceDuration,
  );
}

export function outputFrameForSourceFrame(
  sourceFrame: number,
  freezes: FreezeFrameEdit[] | undefined,
  sourceDuration: number,
  playback?: PlaybackSpeedEdit,
): number {
  const normalized = normalizeFreezes(freezes, sourceDuration);
  const speed = normalizePlaybackSpeed(playback);
  const clampedSourceFrame = clampFrame(sourceFrame, sourceDuration);
  let outputCursor = 0;
  let sourceCursor = 0;

  for (const freeze of normalized) {
    if (clampedSourceFrame <= freeze.atFrame) {
      return (
        outputCursor +
        Math.floor(Math.max(0, clampedSourceFrame - sourceCursor) / speed)
      );
    }
    outputCursor += sourceFramesToOutputFrames(
      Math.max(0, freeze.atFrame - sourceCursor + 1),
      speed,
    );
    outputCursor += freeze.durationFrames;
    sourceCursor = Math.min(sourceDuration, freeze.atFrame + 1);
  }

  return (
    outputCursor +
    Math.floor(Math.max(0, clampedSourceFrame - sourceCursor) / speed)
  );
}

export function sourceFrameToRawFrame(
  sourceFrame: number,
  trim: TrimFrameEdit | undefined,
  rawSourceDuration: number,
): number {
  const normalized = normalizeTrim(trim, rawSourceDuration);
  return Math.max(
    normalized.startFrame,
    Math.min(normalized.endFrame - 1, normalized.startFrame + Math.round(sourceFrame)),
  );
}

export function rawFrameToSourceFrame(
  rawFrame: number,
  trim: TrimFrameEdit | undefined,
  rawSourceDuration: number,
): number {
  const normalized = normalizeTrim(trim, rawSourceDuration);
  return Math.max(
    0,
    Math.min(normalized.endFrame - normalized.startFrame - 1, Math.round(rawFrame) - normalized.startFrame),
  );
}

export function withFreezeEdits(
  composition: EditComposition,
  freezes: FreezeFrameEdit[],
): EditComposition {
  const sourceDuration = sourceDurationFrames(composition);
  const normalizedFreezes = normalizeFreezes(freezes, sourceDuration);
  return withTimelineDuration({
    ...composition,
    timelineEdits: {
      ...composition.timelineEdits,
      freezes: normalizedFreezes,
    },
  });
}

export function withTrimEdit(
  composition: EditComposition,
  trim: TrimFrameEdit,
): EditComposition {
  const rawDuration = rawSourceDurationFrames(composition);
  const normalizedTrim = normalizeTrim(trim, rawDuration);
  const sourceDuration = normalizedTrim.endFrame - normalizedTrim.startFrame;
  const normalizedFreezes = normalizeFreezes(
    composition.timelineEdits?.freezes,
    sourceDuration,
  );
  return withTimelineDuration({
    ...composition,
    timelineEdits: {
      ...composition.timelineEdits,
      trim: normalizedTrim,
      freezes: normalizedFreezes,
    },
  });
}

export function normalizeFreezes(
  freezes: FreezeFrameEdit[] | undefined,
  sourceDuration: number,
): FreezeFrameEdit[] {
  const byFrame = new Map<number, FreezeFrameEdit>();
  for (const freeze of freezes ?? []) {
    const atFrame = clampFrame(freeze.atFrame, sourceDuration);
    const existing = byFrame.get(atFrame);
    byFrame.set(atFrame, {
      ...freeze,
      id: existing?.id ?? freeze.id,
      atFrame,
      durationFrames: Math.max(1, Math.round((existing?.durationFrames ?? 0) + freeze.durationFrames)),
    });
  }
  return [...byFrame.values()].sort((a, b) => a.atFrame - b.atFrame);
}

export function normalizeTrim(
  trim: TrimFrameEdit | undefined,
  rawDurationFrames: number,
): TrimFrameEdit {
  const duration = Math.max(1, Math.round(rawDurationFrames));
  const startFrame = Math.max(0, Math.min(duration - 1, Math.round(trim?.startFrame ?? 0)));
  const endFrame = Math.max(
    startFrame + 1,
    Math.min(duration, Math.round(trim?.endFrame ?? duration)),
  );
  return { startFrame, endFrame };
}

export function normalizePlaybackSpeed(playback: PlaybackSpeedEdit | undefined): number {
  const speed = playback?.speed;
  if (speed === undefined || !Number.isFinite(speed)) return 1;
  return Math.max(0.5, Math.min(16, speed));
}

export function sourceFramesToOutputFrames(
  sourceFrameCount: number,
  playbackSpeed: number,
): number {
  const frames = Math.max(0, Math.round(sourceFrameCount));
  if (frames === 0) return 0;
  return Math.max(1, Math.ceil(frames / normalizePlaybackSpeed({ speed: playbackSpeed })));
}

function withTimelineDuration(composition: EditComposition): EditComposition {
  const baseLayer = composition.layers.find((layer) => layer.kind === "video-source");
  const normalizedFreezes = normalizeFreezes(
    composition.timelineEdits?.freezes,
    sourceDurationFrames(composition),
  );
  const videoEnd =
    (baseLayer?.time.start ?? 0) +
    outputDurationForTimelineEdits(rawSourceDurationFrames(composition), {
      ...composition.timelineEdits,
      freezes: normalizedFreezes,
    });
  const layerEnd = composition.layers.reduce(
    (end, layer) => Math.max(end, layer.time.start + layer.time.duration),
    1,
  );
  const preserveLayerEnd =
    Boolean(composition.templateId) || (baseLayer?.time.start ?? 0) > 0;
  return {
    ...composition,
    canvas: {
      ...composition.canvas,
      durationFrames: Math.max(1, videoEnd, preserveLayerEnd ? layerEnd : 1),
    },
    timelineEdits: {
      ...composition.timelineEdits,
      freezes: normalizedFreezes,
    },
  };
}

function clampFrame(frame: number, durationFrames: number): number {
  return Math.max(0, Math.min(Math.max(0, durationFrames - 1), Math.round(frame)));
}

function uniquifyIds<T extends { id: string }>(items: T[], fallbackPrefix: string): T[] {
  const seen = new Map<string, number>();
  let changed = false;
  const nextItems = items.map((item) => {
    const baseId = item.id.trim() || fallbackPrefix;
    const previousCount = seen.get(baseId) ?? 0;
    seen.set(baseId, previousCount + 1);
    if (previousCount === 0 && baseId === item.id) return item;

    changed = true;
    return {
      ...item,
      id: previousCount === 0 ? baseId : `${baseId}-${previousCount + 1}`,
    };
  });

  return changed ? nextItems : items;
}

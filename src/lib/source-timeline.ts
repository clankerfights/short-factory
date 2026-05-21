import type {
  BaseRecordingTiming,
  FreezeFrameEdit,
  PlaybackSpeedEdit,
  TrimFrameEdit,
} from "./edit-model";
import {
  normalizeTrim,
  sourceDurationForTimelineEdits,
  sourceFrameForOutputFrame,
} from "./composition-utils";

export function normalizeBaseRecordingTiming(
  timing: BaseRecordingTiming | undefined,
  clipDurationFrames: number,
  fps: number,
): BaseRecordingTiming {
  const duration = Math.max(1, Math.round(clipDurationFrames));
  const playbackRate = normalizePlaybackRate(timing?.playbackRate);
  const recordedDurationFrames = Math.max(
    Math.ceil(duration / playbackRate),
    Math.round(timing?.recordedDurationFrames ?? duration),
  );
  const clipStartFrame = clampFrame(timing?.clipStartFrame ?? 0, recordedDurationFrames);
  const fallbackEnd = Math.min(
    recordedDurationFrames,
    clipStartFrame + Math.ceil(duration / playbackRate),
  );
  const clipEndFrame = Math.max(
    clipStartFrame + 1,
    Math.min(
      recordedDurationFrames,
      fallbackEnd,
      Math.round(timing?.clipEndFrame ?? fallbackEnd),
    ),
  );
  return {
    fps: timing?.fps ?? fps,
    recordedDurationFrames,
    clipStartFrame,
    clipEndFrame,
    clipDurationFrames: Math.max(
      1,
      Math.min(duration, Math.round(timing?.clipDurationFrames ?? duration)),
    ),
    playbackRate,
    method: timing?.method ?? "none",
    confidence: timing?.confidence ?? "low",
  };
}

export function recordingFrameForSourceFrame(args: {
  sourceFrame: number;
  trim?: TrimFrameEdit;
  sourceDurationFrames: number;
  baseVideoTiming?: BaseRecordingTiming;
  fps: number;
}): number {
  const timing = normalizeBaseRecordingTiming(
    args.baseVideoTiming,
    args.sourceDurationFrames,
    args.fps,
  );
  const trim = normalizeTrim(args.trim, args.sourceDurationFrames);
  const canonicalFrame = Math.max(
    trim.startFrame,
    Math.min(
      trim.endFrame - 1,
      trim.startFrame + Math.round(args.sourceFrame),
    ),
  );
  return Math.max(
    0,
    Math.min(
      timing.recordedDurationFrames - 1,
      timing.clipStartFrame + Math.round(canonicalFrame / timing.playbackRate),
    ),
  );
}

export function mediaPlaybackRateForSourceTimeline(
  timing: BaseRecordingTiming | undefined,
): number {
  return 1 / normalizePlaybackRate(timing?.playbackRate);
}

export function recordingFrameForOutputFrame(args: {
  outputFrame: number;
  freezes?: FreezeFrameEdit[];
  playback?: PlaybackSpeedEdit;
  trim?: TrimFrameEdit;
  sourceDurationFrames: number;
  baseVideoTiming?: BaseRecordingTiming;
  fps: number;
}): number {
  const sourceDuration = sourceDurationForTimelineEdits(
    args.sourceDurationFrames,
    { trim: args.trim },
  );
  const sourceFrame = sourceFrameForOutputFrame(
    Math.max(0, args.outputFrame),
    args.freezes,
    sourceDuration,
    args.playback,
  );
  return recordingFrameForSourceFrame({
    sourceFrame,
    trim: args.trim,
    sourceDurationFrames: args.sourceDurationFrames,
    baseVideoTiming: args.baseVideoTiming,
    fps: args.fps,
  });
}

function clampFrame(frame: number, durationFrames: number): number {
  return Math.max(0, Math.min(Math.max(0, durationFrames - 1), Math.round(frame)));
}

function normalizePlaybackRate(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(0.1, Math.min(16, value));
}

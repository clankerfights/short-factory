import type { CSSProperties } from "react";
import { Freeze, OffthreadVideo, Sequence, staticFile } from "remotion";
import type { BaseRecordingTiming, EditComposition, FreezeFrameEdit } from "../../lib/edit-model";
import {
  normalizeFreezes,
  normalizePlaybackSpeed,
  sourceFramesToOutputFrames,
  sourceDurationForTimelineEdits,
} from "../../lib/composition-utils";
import {
  clampRecordingFrame,
  mediaPlaybackRateForSourceTimeline,
  recordingFrameForSourceFrame,
} from "../../lib/source-timeline";

type TimelineVideoChunk = {
  kind: "normal" | "freeze";
  localStartFrame: number;
  durationFrames: number;
  sourceFrame: number;
  recordingFrame?: number;
};

export function TimelineVideo({
  baseVideoSrc,
  baseVideoTiming,
  timelineEdits,
  rawSourceDurationFrames,
  outputStartFrame = 0,
  outputDurationFrames,
  fps = 30,
  muted = true,
  style,
}: {
  baseVideoSrc: string;
  baseVideoTiming?: BaseRecordingTiming;
  timelineEdits?: EditComposition["timelineEdits"];
  rawSourceDurationFrames: number;
  outputStartFrame?: number;
  outputDurationFrames: number;
  fps?: number;
  muted?: boolean;
  style: CSSProperties;
}) {
  const source = baseVideoSrc.startsWith("http")
    ? baseVideoSrc
    : staticFile(baseVideoSrc);
  const sourceDuration = sourceDurationForTimelineEdits(
    rawSourceDurationFrames,
    timelineEdits,
  );
  const freezes = normalizeFreezes(timelineEdits?.freezes, sourceDuration);
  const playbackSpeed = normalizePlaybackSpeed(timelineEdits?.playback);
  const chunks = timelineVideoChunks({
    outputStartFrame,
    outputDurationFrames,
    freezes,
    sourceDuration,
    playbackSpeed,
  });
  const playbackRate = mediaPlaybackRateForSourceTimeline(baseVideoTiming) * playbackSpeed;

  return (
    <>
      {chunks.map((chunk, index) => {
        const startFrom =
          chunk.recordingFrame !== undefined
            ? clampRecordingFrame({
                recordingFrame: chunk.recordingFrame,
                baseVideoTiming,
                sourceDurationFrames: rawSourceDurationFrames,
                fps,
              })
            : recordingFrameForSourceFrame({
                sourceFrame: chunk.sourceFrame,
                trim: timelineEdits?.trim,
                sourceDurationFrames: rawSourceDurationFrames,
                baseVideoTiming,
                fps,
              });

        return (
          <Sequence
            key={`${chunk.kind}-${chunk.localStartFrame}-${index}`}
            from={chunk.localStartFrame}
            durationInFrames={chunk.durationFrames}
          >
            {chunk.kind === "freeze" ? (
              <Freeze frame={0}>
                <OffthreadVideo
                  src={source}
                  muted={muted}
                  startFrom={startFrom}
                  style={style}
                />
              </Freeze>
            ) : (
              <OffthreadVideo
                src={source}
                muted={muted}
                playbackRate={playbackRate}
                startFrom={startFrom}
                style={style}
              />
            )}
          </Sequence>
        );
      })}
    </>
  );
}

function timelineVideoChunks(args: {
  outputStartFrame: number;
  outputDurationFrames: number;
  freezes: FreezeFrameEdit[];
  sourceDuration: number;
  playbackSpeed: number;
}): TimelineVideoChunk[] {
  const rangeStart = Math.max(0, Math.round(args.outputStartFrame));
  const rangeEnd = Math.max(
    rangeStart,
    rangeStart + Math.max(0, Math.round(args.outputDurationFrames)),
  );
  if (rangeEnd <= rangeStart) return [];

  const chunks: TimelineVideoChunk[] = [];
  let outputCursor = 0;
  let sourceCursor = 0;

  for (const freeze of args.freezes) {
    const sourceFrames = Math.max(0, freeze.atFrame - sourceCursor);
    const normalDuration = sourceFramesToOutputFrames(sourceFrames, args.playbackSpeed);
    pushIntersection(chunks, {
      kind: "normal",
      chunkStartFrame: outputCursor,
      chunkDurationFrames: normalDuration,
      sourceFrame: sourceCursor,
      rangeStart,
      rangeEnd,
      sourceDuration: args.sourceDuration,
      playbackSpeed: args.playbackSpeed,
    });
    outputCursor += normalDuration;

    pushIntersection(chunks, {
      kind: "freeze",
      chunkStartFrame: outputCursor,
      chunkDurationFrames: freeze.durationFrames,
      sourceFrame: freeze.atFrame,
      recordingFrame: freeze.recordingFrame,
      rangeStart,
      rangeEnd,
      sourceDuration: args.sourceDuration,
      playbackSpeed: args.playbackSpeed,
    });
    outputCursor += freeze.durationFrames;
    sourceCursor = Math.min(args.sourceDuration, freeze.atFrame + 1);
  }

  const tailDuration = Math.max(0, args.sourceDuration - sourceCursor);
  pushIntersection(chunks, {
    kind: "normal",
    chunkStartFrame: outputCursor,
    chunkDurationFrames: sourceFramesToOutputFrames(tailDuration, args.playbackSpeed),
    sourceFrame: sourceCursor,
    rangeStart,
    rangeEnd,
    sourceDuration: args.sourceDuration,
    playbackSpeed: args.playbackSpeed,
  });
  outputCursor += sourceFramesToOutputFrames(tailDuration, args.playbackSpeed);

  if (rangeEnd > outputCursor) {
    pushIntersection(chunks, {
      kind: "freeze",
      chunkStartFrame: outputCursor,
      chunkDurationFrames: rangeEnd - outputCursor,
      sourceFrame: Math.max(0, args.sourceDuration - 1),
      rangeStart,
      rangeEnd,
      sourceDuration: args.sourceDuration,
      playbackSpeed: args.playbackSpeed,
    });
  }

  return chunks;
}

function pushIntersection(
  chunks: TimelineVideoChunk[],
  args: {
    kind: TimelineVideoChunk["kind"];
    chunkStartFrame: number;
    chunkDurationFrames: number;
    sourceFrame: number;
    recordingFrame?: number;
    rangeStart: number;
    rangeEnd: number;
    sourceDuration: number;
    playbackSpeed: number;
  },
): void {
  if (args.chunkDurationFrames <= 0) return;
  const chunkEndFrame = args.chunkStartFrame + args.chunkDurationFrames;
  const intersectionStart = Math.max(args.rangeStart, args.chunkStartFrame);
  const intersectionEnd = Math.min(args.rangeEnd, chunkEndFrame);
  if (intersectionEnd <= intersectionStart) return;

  const sourceOffset =
    args.kind === "normal"
      ? Math.floor((intersectionStart - args.chunkStartFrame) * args.playbackSpeed)
      : 0;
  chunks.push({
    kind: args.kind,
    localStartFrame: intersectionStart - args.rangeStart,
    durationFrames: intersectionEnd - intersectionStart,
    sourceFrame: clampFrame(args.sourceFrame + sourceOffset, args.sourceDuration),
    ...(args.recordingFrame !== undefined && Number.isFinite(args.recordingFrame)
      ? { recordingFrame: Math.max(0, Math.round(args.recordingFrame)) }
      : {}),
  });
}

function clampFrame(frame: number, durationFrames: number): number {
  return Math.max(
    0,
    Math.min(Math.max(0, durationFrames - 1), Math.round(frame)),
  );
}

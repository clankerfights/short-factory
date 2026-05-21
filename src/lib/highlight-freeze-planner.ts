import type { FreezeFrameEdit } from "./edit-model";
import { outputFrameForSourceFrame } from "./composition-utils";

export type HighlightReadTiming = {
  id: string;
  sourceFrame: number;
  durationFrames: number;
};

export type PlannedHighlightRead = HighlightReadTiming & {
  outputStartFrame: number;
  freezeId: string;
};

export type HighlightFreezePlan = {
  freezes: FreezeFrameEdit[];
  reads: PlannedHighlightRead[];
};

export function planHighlightReadFreezes(args: {
  reads: HighlightReadTiming[];
  sourceDuration: number;
  outputOffsetFrames: number;
}): HighlightFreezePlan {
  const sortedReads = [...args.reads]
    .filter((read) => read.durationFrames > 0)
    .map((read) => ({
      ...read,
      sourceFrame: Math.max(0, Math.round(read.sourceFrame)),
      durationFrames: Math.max(1, Math.round(read.durationFrames)),
    }))
    .sort((a, b) => a.sourceFrame - b.sourceFrame);

  const freezes: FreezeFrameEdit[] = [];
  const plannedReads: PlannedHighlightRead[] = [];
  let index = 0;

  while (index < sortedReads.length) {
    const sourceFrame = sortedReads[index]?.sourceFrame ?? 0;
    const sameFrameReads: HighlightReadTiming[] = [];
    while (index < sortedReads.length && sortedReads[index]?.sourceFrame === sourceFrame) {
      sameFrameReads.push(sortedReads[index]);
      index += 1;
    }

    const freezeId = `freeze-highlight-${freezeGroupId(sameFrameReads)}`;
    const freezeStart =
      args.outputOffsetFrames + outputFrameForSourceFrame(sourceFrame, freezes, args.sourceDuration);
    let readOffset = 0;

    for (const read of sameFrameReads) {
      plannedReads.push({
        ...read,
        outputStartFrame: freezeStart + readOffset,
        freezeId,
      });
      readOffset += read.durationFrames;
    }

    freezes.push({
      id: freezeId,
      atFrame: sourceFrame,
      durationFrames: readOffset,
    });
  }

  return { freezes, reads: plannedReads };
}

function freezeGroupId(reads: HighlightReadTiming[]): string {
  const first = reads[0]?.id ?? "read";
  const last = reads[reads.length - 1]?.id ?? first;
  return first === last ? first : `${first}-to-${last}`;
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { FactoryJob } from "./types";
import { TIKTOK_CANVAS, type EditComposition } from "./edit-model";
import { ensureBaseRecordingTiming } from "./base-recording-timing";
import { ensureRemotionBinariesDirectory } from "./remotion-binaries";

export type RenderRecipeOptions = {
  job: FactoryJob;
  variantId: string;
  baseRecordingPath: string;
  outputPath: string;
};

export async function renderRecipeVariant(options: RenderRecipeOptions): Promise<string> {
  const variant = options.job.editRecipe.variants.find(
    (candidate) => candidate.variantId === options.variantId,
  );

  if (!variant) {
    throw new Error(`No edit recipe variant found for ${options.variantId}.`);
  }

  const baseRecordingPath = path.resolve(options.baseRecordingPath);
  const baseVideoTiming = await ensureBaseRecordingTiming(options.job, baseRecordingPath);
  const outputLocation = path.resolve(options.outputPath);
  await syncSharedAssets(path.dirname(baseRecordingPath));
  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");
  const binariesDirectory = await ensureRemotionBinariesDirectory();
  const serveUrl = await bundle({
    entryPoint,
    publicDir: path.dirname(baseRecordingPath),
  });
  const inputProps = {
    baseVideoSrc: path.basename(baseRecordingPath),
    baseVideoTiming,
    variant,
  };
  const composition = await selectComposition({
    serveUrl,
    id: "narrator-quote-punchline",
    inputProps,
    binariesDirectory,
  });

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames: variant.composition?.canvas.durationFrames ?? composition.durationInFrames,
    },
    serveUrl,
    codec: "h264",
    pixelFormat: "yuv420p",
    outputLocation,
    inputProps,
    binariesDirectory,
  });

  return outputLocation;
}

export async function renderRawClipVideo(options: {
  job: FactoryJob;
  baseRecordingPath: string;
  outputPath: string;
}): Promise<string> {
  const durationFrames = Math.max(
    1,
    Math.round(options.job.quoteJob.durationSeconds * TIKTOK_CANVAS.fps),
  );
  const baseRecordingPath = path.resolve(options.baseRecordingPath);
  const baseVideoTiming = await ensureBaseRecordingTiming(options.job, baseRecordingPath);
  const cleanDurationFrames = baseVideoTiming.clipDurationFrames || durationFrames;
  const composition: EditComposition = {
    canvas: {
      ...TIKTOK_CANVAS,
      durationFrames: cleanDurationFrames,
    },
    layers: [
      {
        id: "base-recording",
        kind: "video-source",
        name: "Raw clip",
        source: "base-recording",
        time: { start: 0, duration: cleanDurationFrames },
        box: { x: 0, y: 0, width: TIKTOK_CANVAS.width, height: TIKTOK_CANVAS.height },
        fit: "cover",
        zIndex: 0,
      },
    ],
  };
  const baseVariant = options.job.editRecipe.variants[0];
  if (!baseVariant) {
    throw new Error("No edit recipe variant found for raw render.");
  }
  const rawVariant = {
    ...baseVariant,
    variantId: "raw",
    composition,
  };

  await syncSharedAssets(path.dirname(baseRecordingPath));
  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");
  const binariesDirectory = await ensureRemotionBinariesDirectory();
  const serveUrl = await bundle({
    entryPoint,
    publicDir: path.dirname(baseRecordingPath),
  });
  const inputProps = {
    baseVideoSrc: path.basename(baseRecordingPath),
    baseVideoTiming,
    variant: rawVariant,
  };
  const selected = await selectComposition({
    serveUrl,
    id: "narrator-quote-punchline",
    inputProps,
    binariesDirectory,
  });
  const outputLocation = path.resolve(options.outputPath);
  await renderMedia({
    composition: { ...selected, durationInFrames: cleanDurationFrames },
    serveUrl,
    codec: "h264",
    pixelFormat: "yuv420p",
    outputLocation,
    inputProps,
    binariesDirectory,
  });
  return outputLocation;
}

async function syncSharedAssets(jobDir: string): Promise<void> {
  const source = path.join(process.cwd(), "assets");
  const target = path.join(jobDir, "assets");
  await fs.cp(source, target, { recursive: true, force: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}

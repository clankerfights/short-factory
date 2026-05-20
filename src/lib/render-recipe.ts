import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { FactoryJob } from "./types";

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
  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");
  const serveUrl = await bundle({
    entryPoint,
    publicDir: path.dirname(baseRecordingPath),
  });
  const inputProps = {
    baseVideoSrc: path.basename(baseRecordingPath),
    variant,
  };
  const composition = await selectComposition({
    serveUrl,
    id: "narrator-quote-punchline",
    inputProps,
  });

  const outputLocation = path.resolve(options.outputPath);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    pixelFormat: "yuv420p",
    outputLocation,
    inputProps,
  });

  return outputLocation;
}

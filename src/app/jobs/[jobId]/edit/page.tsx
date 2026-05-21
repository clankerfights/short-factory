import { notFound } from "next/navigation";
import { listJobAssets } from "../../../../lib/asset-store";
import { compositionForVariant } from "../../../../lib/composition-utils";
import { readFactoryJob } from "../../../../lib/job-store";
import { listTemplates } from "../../../../lib/template-store";
import { CompositionWorkspace } from "../../../editor/CompositionWorkspace";

export const runtime = "nodejs";

export default async function JobEditorPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  try {
    const { jobId } = await params;
    const [job, templates, assets] = await Promise.all([
      readFactoryJob(jobId),
      listTemplates(),
      listJobAssets(jobId),
    ]);
    const variant = job.editRecipe.variants[0];
    if (!variant) notFound();

    return (
      <CompositionWorkspace
        title={`Job ${job.id.slice(0, 8)}`}
        subtitle={`${job.quoteJob.game} / ${variant.variantId} / ${job.quoteJob.speaker}`}
        initialComposition={compositionForVariant(variant)}
        target={{
          kind: "job",
          jobId: job.id,
          variantId: variant.variantId,
          compositionUrl: `/api/jobs/${job.id}/composition`,
          renderUrl: `/api/jobs/${job.id}/render`,
          openFolderUrl: `/api/jobs/${job.id}/open-folder`,
          ttsUrl: `/api/jobs/${job.id}/tts`,
          renderedVideoUrl: job.artifacts.renderedVideoPath
            ? `/api/jobs/${job.id}/assets/${variant.variantId}.mp4`
            : undefined,
          rawVideoUrl: job.artifacts.rawVideoPath
            ? `/api/jobs/${job.id}/assets/raw.mp4`
            : undefined,
          templates,
          assets,
        }}
      />
    );
  } catch {
    notFound();
  }
}

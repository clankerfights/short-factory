import { notFound } from "next/navigation";
import { listJobAssets } from "../../../../lib/asset-store";
import { compositionForVariant } from "../../../../lib/composition-utils";
import { readFactoryJob, saveFactoryJob } from "../../../../lib/job-store";
import { listTemplates } from "../../../../lib/template-store";
import {
  applyAutomaticTemplate,
  isBuiltInTemplateId,
  isCurrentAutomaticTemplate,
  resolveAutomaticTemplateId,
} from "../../../../lib/template-registry";
import { CompositionWorkspace } from "../../../editor/CompositionWorkspace";

export const runtime = "nodejs";

export default async function JobEditorPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  try {
    const { jobId } = await params;
    const job = await readFactoryJob(jobId);
    const variant = job.editRecipe.variants[0];
    if (!variant) notFound();
    const selectedTemplateId =
      variant.templateId ?? job.quoteJob.selectedTemplateId ?? variant.composition?.templateId;
    const templateId = resolveAutomaticTemplateId(selectedTemplateId);
    const shouldUseAutomaticTemplate =
      isBuiltInTemplateId(selectedTemplateId) ||
      (!selectedTemplateId && !variant.composition) ||
      isBuiltInTemplateId(variant.composition?.templateId);
    if (shouldUseAutomaticTemplate && !isCurrentAutomaticTemplate(variant.composition, templateId)) {
      variant.composition = await applyAutomaticTemplate(job, variant, templateId);
      await saveFactoryJob(job);
    }
    const [templates, assets] = await Promise.all([
      listTemplates(),
      listJobAssets(jobId),
    ]);

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
          renderTargetUrl: `/api/jobs/${job.id}/render-target`,
          openFolderUrl: `/api/jobs/${job.id}/open-folder`,
          ttsUrl: `/api/jobs/${job.id}/tts`,
          renderedVideoUrl: job.artifacts.renderedVideoPath
            ? `/api/jobs/${job.id}/assets/${variant.variantId}.mp4`
            : undefined,
          baseVideoUrl: job.artifacts.baseRecordingPath
            ? `/api/jobs/${job.id}/assets/base-recording.webm`
            : undefined,
          baseVideoTiming: job.artifacts.baseRecordingTiming,
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

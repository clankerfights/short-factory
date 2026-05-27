import path from "node:path";
import type { z } from "zod";
import {
  createAutomatedClipFromSelection,
  fetchClipFactoryPacket,
} from "./clankerfights";
import { jobDirectory, readFactoryJob, saveFactoryJob, createFactoryJob } from "./job-store";
import { normalizeFactoryPacketToQuoteJob } from "./normalize-clip";
import { generateEditRecipe } from "./recipe-generator";
import { runNpmScript } from "./run-script";
import type {
  createJobRequestSchema,
  factoryVideoCreateRequestSchema,
} from "./schemas";
import {
  applyAutomaticTemplate,
  isBuiltInTemplateId,
  isCurrentAutomaticTemplate,
  resolveAutomaticTemplateId,
} from "./template-registry";
import type { FactoryJob } from "./types";
import { generateFinalMessageVoiceInstructions } from "./voice-description";

export type CreateFactoryJobFromClipInput = z.infer<typeof createJobRequestSchema>;
export type CreateFactoryVideoInput = z.infer<typeof factoryVideoCreateRequestSchema>;

export type FactoryWorkflowOptions = {
  record: boolean;
  renderRaw: boolean;
  renderVariants: string[];
  durationSeconds?: number;
  overwrite: boolean;
};

export class FactoryPipelineError extends Error {
  readonly job?: FactoryJob;

  constructor(message: string, job?: FactoryJob) {
    super(message);
    this.name = "FactoryPipelineError";
    this.job = job;
  }
}

export async function createFactoryJobFromClip(
  input: CreateFactoryJobFromClipInput,
): Promise<FactoryJob> {
  return createFactoryJobFromResolvedClip({
    ...input,
    source: { kind: "clip", clipUrl: input.clipUrl },
  });
}

export async function createFactoryJobForVideo(
  input: CreateFactoryVideoInput,
): Promise<FactoryJob> {
  const source = await resolveFactoryVideoClipSource(input);
  return createFactoryJobFromResolvedClip({
    clipUrl: source.clipUrlOrId,
    hookText: input.hookText,
    toneHint: input.toneHint,
    finalMessageTone: input.finalMessageTone,
    templateId: input.templateId,
    clipPlaybackSpeed: input.clipPlaybackSpeed,
    source: source.snapshot,
  });
}

export async function resolveFactoryVideoClipSource(
  input: CreateFactoryVideoInput,
  options: {
    createAutomatedClip?: typeof createAutomatedClipFromSelection;
  } = {},
): Promise<{
  clipUrlOrId: string;
  snapshot: NonNullable<FactoryJob["quoteJob"]["source"]>;
}> {
  if (input.source) {
    if (input.source.kind === "clip") {
      return clipSource(input.source.clipUrl, input.source.clipId);
    }

    const automatedClip = await (
      options.createAutomatedClip ?? createAutomatedClipFromSelection
    )(input.source.createClipRequest);
    return {
      clipUrlOrId: automatedClip.url || automatedClip.clipId,
      snapshot: {
        kind: "watchArchiveSelection",
        createClipRequest: input.source.createClipRequest,
        automatedClip,
      },
    };
  }

  return clipSource(input.clipUrl, input.clipId);
}

function clipSource(
  clipUrl: string | undefined,
  clipId: string | undefined,
): {
  clipUrlOrId: string;
  snapshot: NonNullable<FactoryJob["quoteJob"]["source"]>;
} {
  const clipUrlOrId = clipUrl ?? clipId;
  if (!clipUrlOrId) {
    throw new Error("Provide a clipUrl, clipId, or watchArchiveSelection source.");
  }
  return {
    clipUrlOrId,
    snapshot: {
      kind: "clip",
      ...(clipId ? { clipId } : {}),
      ...(clipUrl ? { clipUrl } : {}),
    },
  };
}

async function createFactoryJobFromResolvedClip(
  input: CreateFactoryJobFromClipInput & {
    source: NonNullable<FactoryJob["quoteJob"]["source"]>;
  },
): Promise<FactoryJob> {
  const { packet, source } = await fetchClipFactoryPacket(input.clipUrl);
  const selectedTemplateId = resolveAutomaticTemplateId(input.templateId);
  const provisionalQuoteJob = normalizeFactoryPacketToQuoteJob({
    packet,
    source,
    hookText: input.hookText,
    toneHint: input.toneHint ?? input.finalMessageTone,
    finalMessageTone: input.finalMessageTone,
    selectedTemplateId,
    clipPlaybackSpeed: input.clipPlaybackSpeed ?? 2,
  });
  const finalMessage =
    provisionalQuoteJob.highlightedMessages[
      provisionalQuoteJob.highlightedMessages.length - 1
    ];
  const finalMessageVoiceInstructions = finalMessage
    ? await generateFinalMessageVoiceInstructions({
        tone: input.finalMessageTone,
        speaker: finalMessage.speaker,
        text: finalMessage.text,
        game: provisionalQuoteJob.game,
      })
    : undefined;
  const quoteJob = finalMessageVoiceInstructions
    ? { ...provisionalQuoteJob, finalMessageVoiceInstructions, source: input.source }
    : { ...provisionalQuoteJob, source: input.source };
  const editRecipe = generateEditRecipe(quoteJob);
  return createFactoryJob({ quoteJob, editRecipe });
}

export async function runFactoryWorkflow(
  jobOrId: FactoryJob | string,
  workflow: FactoryWorkflowOptions,
): Promise<FactoryJob> {
  let job = typeof jobOrId === "string" ? await readFactoryJob(jobOrId) : jobOrId;
  const needsVideo = workflow.renderRaw || workflow.renderVariants.length > 0;
  const shouldRecord =
    workflow.record || (needsVideo && !job.artifacts.baseRecordingPath);

  if (shouldRecord && (workflow.overwrite || !job.artifacts.baseRecordingPath)) {
    job = await recordFactoryJob(job.id, {
      durationSeconds: workflow.durationSeconds,
    });
  }

  if (workflow.renderRaw && (workflow.overwrite || !job.artifacts.rawVideoPath)) {
    job = await renderRawFactoryJob(job.id);
  }

  for (const variantId of workflow.renderVariants) {
    if (!workflow.overwrite && renderedVariantPath(job, variantId)) continue;
    job = await renderRecipeFactoryJob(job.id, { variantId });
  }

  return job;
}

export async function recordFactoryJob(
  jobId: string,
  options: { durationSeconds?: number } = {},
): Promise<FactoryJob> {
  const job = await readFactoryJob(jobId);

  try {
    await runNpmScript("record:clip", [
      "--job-id",
      job.id,
      "--duration",
      String(options.durationSeconds ?? job.quoteJob.durationSeconds),
    ]);

    return readFactoryJob(job.id);
  } catch (error) {
    throw await failJob(job, "recording", error);
  }
}

export async function renderRawFactoryJob(jobId: string): Promise<FactoryJob> {
  const job = await readFactoryJob(jobId);

  try {
    if (!job.artifacts.baseRecordingPath) {
      throw new Error("Record the base clip before rendering the raw MP4.");
    }

    await runNpmScript("render:raw", ["--job-id", job.id]);
    return readFactoryJob(job.id);
  } catch (error) {
    throw await failJob(job, undefined, error);
  }
}

export async function renderRecipeFactoryJob(
  jobId: string,
  options: { variantId: string },
): Promise<FactoryJob> {
  const job = await readFactoryJob(jobId);

  try {
    if (!job.artifacts.baseRecordingPath) {
      throw new Error("Record the base clip before rendering a recipe variant.");
    }

    await ensureAutomaticTemplateForVariant(job, options.variantId);
    await runNpmScript("render:recipe", [
      "--job-id",
      job.id,
      "--variant",
      options.variantId,
    ]);

    const renderedJob = await readFactoryJob(job.id);
    const renderedPath =
      renderedJob.artifacts.renderedVariants?.[options.variantId] ??
      renderedJob.artifacts.renderedVideoPath ??
      path.join(jobDirectory(job.id), `${options.variantId}.mp4`);
    renderedJob.artifacts.renderedVariants = {
      ...(renderedJob.artifacts.renderedVariants ?? {}),
      [options.variantId]: renderedPath,
    };
    renderedJob.artifacts.renderedVideoPath = renderedPath;
    delete renderedJob.artifacts.error;
    await saveFactoryJob(renderedJob);
    return renderedJob;
  } catch (error) {
    throw await failJob(job, "render", error);
  }
}

export async function ensureAutomaticTemplateForVariant(
  job: FactoryJob,
  variantId: string,
): Promise<FactoryJob> {
  const variant = job.editRecipe.variants.find(
    (candidate) => candidate.variantId === variantId,
  );
  if (!variant) {
    throw new Error(`No edit recipe variant found for ${variantId}.`);
  }

  const selectedTemplateId =
    variant.templateId ?? job.quoteJob.selectedTemplateId ?? variant.composition?.templateId;
  const templateId = resolveAutomaticTemplateId(selectedTemplateId);
  const shouldUseAutomaticTemplate =
    isBuiltInTemplateId(selectedTemplateId) ||
    (!selectedTemplateId && !variant.composition) ||
    isBuiltInTemplateId(variant.composition?.templateId);

  if (
    shouldUseAutomaticTemplate &&
    !isCurrentAutomaticTemplate(variant.composition, templateId)
  ) {
    variant.composition = await applyAutomaticTemplate(job, variant, templateId);
    await saveFactoryJob(job);
  }

  return job;
}

export function renderedVariantPath(
  job: FactoryJob,
  variantId: string,
): string | undefined {
  const explicit = job.artifacts.renderedVariants?.[variantId];
  if (explicit) return explicit;

  const latestPath = job.artifacts.renderedVideoPath;
  if (latestPath && path.basename(latestPath) === `${variantId}.mp4`) {
    return latestPath;
  }

  return undefined;
}

async function failJob(
  job: FactoryJob,
  status: "recording" | "render" | undefined,
  error: unknown,
): Promise<FactoryPipelineError> {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (status) {
    job.status[status] = "failed";
  }
  job.artifacts.error = message;
  await saveFactoryJob(job);
  return new FactoryPipelineError(message, job);
}

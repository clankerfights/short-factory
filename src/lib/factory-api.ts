import path from "node:path";
import { renderedVariantPath } from "./factory-pipeline";
import { jobDirectory } from "./job-store";
import type { FactoryJob } from "./types";

export const FACTORY_API_VERSION = "2026-05-27";

export function buildFactoryVideoResponse(
  request: Request,
  job: FactoryJob,
) {
  const origin = new URL(request.url).origin;
  const artifacts = buildArtifactLinks(origin, job);

  return {
    apiVersion: FACTORY_API_VERSION,
    kind: "factory.videoJob",
    jobId: job.id,
    createdAt: job.createdAt,
    status: job.status,
    clip: {
      id: job.quoteJob.clipId,
      url: job.quoteJob.clipUrl,
      playbackUrl: job.quoteJob.playbackUrl,
      game: job.quoteJob.game,
      speaker: job.quoteJob.speaker,
      highlightedChatIds: job.quoteJob.highlightedChatIds,
      highlightedMessages: job.quoteJob.highlightedMessages,
    },
    variants: job.editRecipe.variants.map((variant) => ({
      id: variant.variantId,
      template: variant.template,
      templateId: variant.templateId ?? job.quoteJob.selectedTemplateId,
      setupLine: variant.setupLine,
      openingCaption: variant.openingCaption,
      speaker: variant.speaker,
      captionStyle: variant.captionStyle,
      quoteText: variant.quoteText,
      punchlinePhrase: variant.punchlinePhrase,
      video: artifacts.renderedVideos[variant.variantId],
    })),
    artifacts,
    editRecipe: job.editRecipe,
    links: {
      self: `${origin}/api/factory/videos/${job.id}`,
      actions: `${origin}/api/factory/videos/${job.id}/actions`,
      editor: `${origin}/jobs/${job.id}/edit`,
      legacyJob: `${origin}/api/jobs/${job.id}`,
    },
    error: job.artifacts.error,
  };
}

export function buildFactoryVideoListResponse(
  request: Request,
  jobs: FactoryJob[],
) {
  return {
    apiVersion: FACTORY_API_VERSION,
    kind: "factory.videoJobList",
    videos: jobs.map((job) => buildFactoryVideoResponse(request, job)),
  };
}

function buildArtifactLinks(origin: string, job: FactoryJob) {
  const renderedVideos = Object.fromEntries(
    job.editRecipe.variants
      .map((variant) => {
        const artifactPath = renderedVariantPath(job, variant.variantId);
        return [
          variant.variantId,
          artifactPath
            ? artifactLink(origin, job.id, artifactPath, "rendered-video")
            : undefined,
        ] as const;
      })
      .filter((entry): entry is readonly [string, ArtifactLink] => Boolean(entry[1])),
  );

  return {
    baseRecording: artifactLink(
      origin,
      job.id,
      job.artifacts.baseRecordingPath,
      "base-recording",
    ),
    rawVideo: artifactLink(origin, job.id, job.artifacts.rawVideoPath, "raw-video"),
    factoryPacket: artifactLink(
      origin,
      job.id,
      job.artifacts.factoryPacketPath,
      "factory-packet",
    ),
    renderedVideos,
  };
}

type ArtifactLink = {
  kind: string;
  path: string;
  url: string;
};

function artifactLink(
  origin: string,
  jobId: string,
  absolutePath: string | undefined,
  kind: string,
): ArtifactLink | undefined {
  if (!absolutePath) return undefined;
  const root = path.resolve(jobDirectory(jobId));
  const resolved = path.resolve(absolutePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return undefined;
  }

  const relativePath = path.relative(root, resolved);
  const assetPath = relativePath
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join("/");

  return {
    kind,
    path: resolved,
    url: `${origin}/api/jobs/${jobId}/assets/${assetPath}`,
  };
}

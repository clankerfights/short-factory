"use client";

import { FormEvent, useEffect, useState } from "react";
import type { FactoryJob } from "../lib/types";
import { DEFAULT_CLIP_PLAYBACK_SPEED } from "../lib/factory-defaults";

const DEFAULT_TEMPLATE_ID = "default";
const CLIP_PLAYBACK_SPEED_OPTIONS = [1, 2, 3, 4, 6, 8, 10, 16, 32] as const;

type ApiJobResponse = {
  job?: FactoryJob;
  error?: string;
};

type TemplateOption = {
  id: string;
  name: string;
  description?: string;
  version?: number;
};

type ApiTemplatesResponse = {
  builtInTemplates?: TemplateOption[];
  error?: string;
};

type FactoryVideoSummary = {
  jobId: string;
  createdAt: string;
  source?: { kind?: string };
  clip?: { game?: string };
  variants?: Array<{
    id: string;
    setupLine?: string;
    openingCaption?: string;
  }>;
  links?: { editor?: string };
};

type ApiFactoryVideosResponse = {
  videos?: FactoryVideoSummary[];
  error?: string;
};

const fallbackTemplates: TemplateOption[] = [
  {
    id: DEFAULT_TEMPLATE_ID,
    name: "Default",
    description: "Hook intro, TTS, clustered highlight freezes, bot faces, and outro.",
    version: 2,
  },
];

export default function Home() {
  const [clipUrl, setClipUrl] = useState("");
  const [hookText, setHookText] = useState("");
  const [finalMessageTone, setFinalMessageTone] = useState("");
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [clipPlaybackSpeed, setClipPlaybackSpeed] = useState(DEFAULT_CLIP_PLAYBACK_SPEED);
  const [templates, setTemplates] = useState<TemplateOption[]>(fallbackTemplates);
  const [factoryVideos, setFactoryVideos] = useState<FactoryVideoSummary[]>([]);
  const [selectedFactoryVideoId, setSelectedFactoryVideoId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    void loadTemplates();
    void loadFactoryVideos();
  }, []);

  async function loadTemplates() {
    const response = await fetch("/api/templates");
    const payload = (await response.json()) as ApiTemplatesResponse;
    if (response.ok && payload.builtInTemplates?.length) {
      setTemplates(payload.builtInTemplates);
      if (!payload.builtInTemplates.some((template) => template.id === templateId)) {
        setTemplateId(payload.builtInTemplates[0]?.id ?? DEFAULT_TEMPLATE_ID);
      }
    }
  }

  async function loadFactoryVideos() {
    try {
      const response = await fetch("/api/factory/videos", { cache: "no-store" });
      const payload = (await response.json()) as ApiFactoryVideosResponse;
      if (!response.ok || !payload.videos) return;
      const automatedVideos = payload.videos.filter(
        (video) => video.source?.kind === "watchArchiveSelection",
      );
      setFactoryVideos(automatedVideos);
      setSelectedFactoryVideoId((current) =>
        automatedVideos.some((video) => video.jobId === current)
          ? current
          : (automatedVideos[0]?.jobId ?? ""),
      );
    } catch {
      setFactoryVideos([]);
      setSelectedFactoryVideoId("");
    }
  }

  function openSelectedFactoryVideo() {
    const selected = factoryVideos.find((video) => video.jobId === selectedFactoryVideoId);
    if (!selected) return;
    window.location.assign(selected.links?.editor ?? `/jobs/${selected.jobId}/edit`);
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestEditorReadyNotificationPermission();
    setBusy(true);
    setError(null);

    try {
      setStatus("Creating job and final-line voice direction...");
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clipUrl,
          hookText,
          finalMessageTone,
          templateId,
          clipPlaybackSpeed,
        }),
      });
      const payload = (await response.json()) as ApiJobResponse;
      if (!response.ok || !payload.job) {
        throw new Error(payload.error ?? "Job creation failed.");
      }

      setStatus("Recording the clip in the phone-shaped viewport...");
      const recordedJob = await runPipelineStep(payload.job, "record");

      setStatus("Rendering the raw MP4...");
      const renderedJob = await runPipelineStep(recordedJob, "raw-render");

      setStatus("Opening the editor with the selected template...");
      prepareEditorReadyNotification(renderedJob);
      window.location.assign(`/jobs/${renderedJob.id}/edit?notify=ready`);
    } catch (error) {
      setBusy(false);
      setStatus(null);
      setError(error instanceof Error ? error.message : "Clip generation failed.");
    }
  }

  async function runPipelineStep(
    activeJob: FactoryJob,
    step: "record" | "raw-render",
  ): Promise<FactoryJob> {
    const response = await fetch(`/api/jobs/${activeJob.id}/${step}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const payload = (await response.json()) as ApiJobResponse;
    if (!response.ok || !payload.job) {
      throw new Error(payload.error ?? `${step} failed.`);
    }

    return payload.job;
  }

  const disabled =
    hydrated &&
    (busy || !clipUrl.trim() || !hookText.trim() || !finalMessageTone.trim());
  const selectedFactoryVideo = factoryVideos.find(
    (video) => video.jobId === selectedFactoryVideoId,
  );

  return (
    <main className="factoryHome">
      <section className="launchPanel">
        <header className="launchHeader">
          <p className="eyebrow">Clankerfights TikTok Factory</p>
          <h1>Create a short</h1>
        </header>

        <section className="resumePanel">
          <label>
            <span>Autoclipped jobs</span>
            <select
              value={selectedFactoryVideoId}
              onChange={(event) => setSelectedFactoryVideoId(event.target.value)}
              disabled={factoryVideos.length === 0}
            >
              {factoryVideos.length === 0 ? (
                <option value="">No autoclipped jobs yet</option>
              ) : (
                factoryVideos.map((video) => (
                  <option value={video.jobId} key={video.jobId}>
                    {factoryVideoOptionLabel(video)}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="resumeBand">
            <div className="selectedJobSummary">
              <strong>
                {selectedFactoryVideo ? factoryVideoLabel(selectedFactoryVideo) : "No job selected"}
              </strong>
              <span>
                {selectedFactoryVideo
                  ? `${selectedFactoryVideo.clip?.game ?? "clankerfights"} / ${formatDateTime(selectedFactoryVideo.createdAt)}`
                  : "No saved jobs"}
              </span>
            </div>
            <button
              className="secondaryButton"
              type="button"
              onClick={openSelectedFactoryVideo}
              disabled={!selectedFactoryVideo}
            >
              Open editor
            </button>
          </div>
        </section>

        <form className="launchForm" onSubmit={createJob}>
          <label>
            <span>Clip URL or ID</span>
            <input
              value={clipUrl}
              onChange={(event) => setClipUrl(event.target.value)}
              placeholder="https://clankerfights.ai/?clip=..."
              autoComplete="off"
            />
          </label>

          <label>
            <span>Hook text</span>
            <textarea
              value={hookText}
              onChange={(event) => setHookText(event.target.value)}
              placeholder="2026 AI is getting unhinged"
              rows={3}
            />
          </label>

          <label>
            <span>Tone for final highlighted chat</span>
            <textarea
              value={finalMessageTone}
              onChange={(event) => setFinalMessageTone(event.target.value)}
              placeholder="Deep, commanding, slightly dramatic, with a pause before the last sentence."
              rows={4}
            />
          </label>

          <label>
            <span>Template</span>
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                  {template.version ? ` v${template.version}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Gameplay speed</span>
            <select
              value={clipPlaybackSpeed}
              onChange={(event) => setClipPlaybackSpeed(Number(event.target.value))}
            >
              {CLIP_PLAYBACK_SPEED_OPTIONS.map((speed) => (
                <option value={speed} key={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>

          <button className="primaryButton launchButton" disabled={disabled}>
            {busy ? "Generating..." : "Generate MP4 and open editor"}
          </button>
        </form>

        {status ? <div className="pipelineStatus">{status}</div> : null}
        {error ? <div className="errorLine">{error}</div> : null}
      </section>
    </main>
  );
}

function factoryVideoOptionLabel(video: FactoryVideoSummary): string {
  return `${factoryVideoLabel(video)} - ${formatDateTime(video.createdAt)}`;
}

function factoryVideoLabel(video: FactoryVideoSummary): string {
  const variant = video.variants?.[0];
  return titleCase(
    variant?.setupLine || variant?.openingCaption || `Job ${video.jobId.slice(0, 8)}`,
  );
}

function titleCase(value: string): string {
  return value
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function prepareEditorReadyNotification(job: FactoryJob): void {
  requestEditorReadyNotificationPermission();
  try {
    window.sessionStorage.setItem(
      editorReadyNotificationKey(job.id),
      JSON.stringify({
        jobId: job.id,
        game: job.quoteJob.game,
        createdAt: Date.now(),
      }),
    );
  } catch {
    // Session storage is a nice-to-have bridge between the launch page and editor.
  }
}

function requestEditorReadyNotificationPermission(): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
}

function editorReadyNotificationKey(jobId: string): string {
  return `short-factory:editor-ready:${jobId}`;
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { FactoryJob } from "../lib/types";

const toneHints = ["", "too_deep", "deadpan", "roast", "matrix", "iconic"];

type ApiJobResponse = {
  job?: FactoryJob;
  error?: string;
};

export default function Home() {
  const [clipUrl, setClipUrl] = useState("");
  const [toneHint, setToneHint] = useState("");
  const [job, setJob] = useState<FactoryJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ingest" | "record" | "raw-render" | "render" | "open-folder" | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const selectedVariant = job?.editRecipe.variants[0];
  const quoteText = useMemo(
    () => job?.quoteJob.highlightedMessages.map((message) => message.text).join(" "),
    [job],
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("ingest");
    setError(null);
    setJob(null);

    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clipUrl, toneHint: toneHint || undefined }),
    });
    const payload = (await response.json()) as ApiJobResponse;
    setBusy(null);

    if (!response.ok || !payload.job) {
      setError(payload.error ?? "Job creation failed.");
      return;
    }

    setJob(payload.job);
    await runInitialRawPipeline(payload.job);
  }

  async function runInitialRawPipeline(createdJob: FactoryJob) {
    const recorded = await runStep("record", createdJob);
    if (!recorded) return;
    await runStep("raw-render", recorded);
  }

  async function runStep(step: "record" | "raw-render" | "render", activeJob = job) {
    if (!activeJob) return null;
    setBusy(step);
    setError(null);

    const response = await fetch(`/api/jobs/${activeJob.id}/${step}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: step === "render" ? JSON.stringify({ variantId: selectedVariant?.variantId }) : "{}",
    });
    const payload = (await response.json()) as ApiJobResponse;
    setBusy(null);

    if (!response.ok || !payload.job) {
      setError(payload.error ?? `${step} failed.`);
      if (payload.job) setJob(payload.job);
      return null;
    }

    setJob(payload.job);
    return payload.job;
  }

  async function openRenderedFolder(activeJob = job) {
    if (!activeJob) return;
    setBusy("open-folder");
    setError(null);

    const response = await fetch(`/api/jobs/${activeJob.id}/open-folder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifact: "rendered" }),
    });
    const payload = (await response.json()) as { error?: string };
    setBusy(null);

    if (!response.ok) {
      setError(payload.error ?? "Could not open the MP4 folder.");
    }
  }

  return (
    <main>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Clip to TikTok</p>
            <h1>Make a Clankerfights short</h1>
          </div>
          <div className="statusPills">
            <a href="/templates">Templates</a>
            <span>Paste clip</span>
            <span>Edit overlays</span>
            <span>Render MP4</span>
          </div>
        </header>

        <form className="controlBand" onSubmit={createJob}>
          <label className="urlField">
            <span>Clip URL or ID</span>
            <input
              value={clipUrl}
              onChange={(event) => setClipUrl(event.target.value)}
              placeholder="https://clankerfights.ai/clip/..."
            />
          </label>

          <label className="toneField">
            <span>Tone</span>
            <select value={toneHint} onChange={(event) => setToneHint(event.target.value)}>
              {toneHints.map((hint) => (
                <option value={hint} key={hint || "auto"}>
                  {hint || "auto"}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primaryButton"
            disabled={hydrated && (busy !== null || !clipUrl.trim())}
          >
            {busy === "ingest" ? "Fetching..." : "Create raw MP4"}
          </button>
        </form>

        {error ? <div className="errorLine">{error}</div> : null}

        {job ? (
          <div className="jobGrid">
            <section className="panel quotePanel">
              <div className="sectionHeader">
                <div>
                  <p className="eyebrow">Clip</p>
                  <h2>{job.quoteJob.speaker}</h2>
                </div>
                <span className="mono">{job.quoteJob.game}</span>
              </div>

              <blockquote>{quoteText}</blockquote>

              <dl className="details">
                <div>
                  <dt>Clip ID</dt>
                  <dd>{job.quoteJob.clipId}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{job.quoteJob.durationSeconds}s</dd>
                </div>
                <div>
                  <dt>Highlights</dt>
                  <dd>{job.quoteJob.highlightedChatIds.join(", ")}</dd>
                </div>
              </dl>
            </section>

            <section className="panel pipelinePanel">
              <div className="sectionHeader">
                <div>
                  <p className="eyebrow">Next steps</p>
                  <h2>Record, edit, render</h2>
                </div>
                <span className={`state ${job.artifacts.rawVideoPath ? "complete" : "pending"}`}>
                  {job.artifacts.rawVideoPath ? "raw ready" : busy ?? "pending"}
                </span>
              </div>

              <div className="actions">
                <a
                  className="secondaryButton linkButton"
                  href={`/jobs/${job.id}/edit`}
                  aria-disabled={!job.artifacts.rawVideoPath}
                >
                  Edit overlays
                </a>
                <a
                  className="secondaryButton linkButton"
                  href="/templates"
                  aria-disabled={!job.artifacts.rawVideoPath}
                >
                  Choose template
                </a>
                <button
                  className="secondaryButton"
                  onClick={() => runStep("record")}
                  disabled={busy !== null}
                >
                  {busy === "record" ? "Recording..." : "Record 9:16"}
                </button>
                <button
                  className="secondaryButton"
                  onClick={() => runStep("raw-render")}
                  disabled={busy !== null || !job.artifacts.baseRecordingPath}
                >
                  {busy === "raw-render" ? "Rendering raw..." : "Render raw MP4"}
                </button>
                <button
                  className="primaryButton"
                  onClick={() => runStep("render")}
                  disabled={busy !== null || !job.artifacts.baseRecordingPath}
                >
                  {busy === "render" ? "Rendering..." : "Render v1"}
                </button>
                {job.artifacts.renderedVideoPath ? (
                  <button
                    className="secondaryButton"
                    onClick={() => openRenderedFolder()}
                    disabled={busy !== null}
                  >
                    {busy === "open-folder" ? "Opening..." : "Open folder"}
                  </button>
                ) : null}
              </div>

              <div className="artifactList">
                <Artifact label="Base" value={job.artifacts.baseRecordingPath} />
                <Artifact label="Raw MP4" value={job.artifacts.rawVideoPath} />
                <Artifact label="MP4" value={job.artifacts.renderedVideoPath} />
                <Artifact label="Job" value={`data/jobs/${job.id}/job.json`} />
              </div>
            </section>

            <section className="variants">
              {job.editRecipe.variants.map((variant) => (
                <article className="variantCard" key={variant.variantId}>
                  <div className="variantTop">
                    <span>{variant.variantId}</span>
                    <span>{variant.captionStyle}</span>
                  </div>
                  <h3>{variant.openingCaption}</h3>
                  <p>{variant.setupLine}</p>
                  <div className="punchline">{variant.punchlinePhrase}</div>
                </article>
              ))}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Artifact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="artifact">
      <span>{label}</span>
      <code>{value ?? "pending"}</code>
    </div>
  );
}

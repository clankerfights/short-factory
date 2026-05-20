"use client";

import { FormEvent, useMemo, useState } from "react";
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
  const [busy, setBusy] = useState<"ingest" | "record" | "render" | null>(null);
  const selectedVariant = job?.editRecipe.variants[0];
  const quoteText = useMemo(
    () => job?.quoteJob.highlightedMessages.map((message) => message.text).join(" "),
    [job],
  );

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
  }

  async function runStep(step: "record" | "render") {
    if (!job) return;
    setBusy(step);
    setError(null);

    const response = await fetch(`/api/jobs/${job.id}/${step}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: step === "render" ? JSON.stringify({ variantId: selectedVariant?.variantId }) : "{}",
    });
    const payload = (await response.json()) as ApiJobResponse;
    setBusy(null);

    if (!response.ok || !payload.job) {
      setError(payload.error ?? `${step} failed.`);
      if (payload.job) setJob(payload.job);
      return;
    }

    setJob(payload.job);
  }

  return (
    <main>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Quote Factory MVP</p>
            <h1>Clankerfights TikTok Factory</h1>
          </div>
          <div className="statusPills">
            <span>API ingest</span>
            <span>9:16 capture</span>
            <span>Recipe render</span>
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

          <button className="primaryButton" disabled={busy === "ingest" || !clipUrl.trim()}>
            {busy === "ingest" ? "Fetching..." : "Generate"}
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
                  <p className="eyebrow">Pipeline</p>
                  <h2>Artifacts</h2>
                </div>
                <span className={`state ${job.status.render}`}>{job.status.render}</span>
              </div>

              <div className="actions">
                <button
                  className="secondaryButton"
                  onClick={() => runStep("record")}
                  disabled={busy !== null}
                >
                  {busy === "record" ? "Recording..." : "Record 9:16"}
                </button>
                <button
                  className="primaryButton"
                  onClick={() => runStep("render")}
                  disabled={busy !== null || !job.artifacts.baseRecordingPath}
                >
                  {busy === "render" ? "Rendering..." : "Render v1"}
                </button>
              </div>

              <div className="artifactList">
                <Artifact label="Base" value={job.artifacts.baseRecordingPath} />
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

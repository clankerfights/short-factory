"use client";

import { useState } from "react";
import type { EditComposition } from "../../lib/edit-model";
import type { TemplateRecord } from "../../lib/types";

export function TemplatesClient({
  templates,
  starterComposition,
}: {
  templates: TemplateRecord[];
  starterComposition: EditComposition;
}) {
  const [items, setItems] = useState(templates);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createStarter() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Narrator quote punchline",
          description: "Base Clankerfights quote packaging with timed captions and CTA.",
          tags: ["narrator", "quote", "mvp"],
          composition: starterComposition,
        }),
      });
      const result = (await response.json()) as { template?: TemplateRecord; error?: string };
      if (!response.ok || !result.template) {
        throw new Error(result.error ?? "Template create failed.");
      }
      setItems([result.template, ...items]);
      setMessage("Template created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template create failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Template library</p>
          <h1>Reusable clip designs</h1>
        </div>
        <button className="primaryButton" onClick={createStarter} disabled={busy}>
          {busy ? "Creating..." : "New starter template"}
        </button>
      </header>
      {message ? <div className="editorNotice">{message}</div> : null}
      <section className="templateGrid">
        {items.map((template) => (
          <article className="templateCard" key={template.id}>
            <div>
              <p className="eyebrow">v{template.version}</p>
              <h2>{template.name}</h2>
            </div>
            <p>{template.description || "No description yet."}</p>
            <div className="tagRow">
              {template.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <a className="secondaryButton linkButton" href={`/templates/${template.id}/edit`}>
              Edit template
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}

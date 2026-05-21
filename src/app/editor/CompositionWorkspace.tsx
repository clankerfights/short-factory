"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject, PointerEvent, ReactNode } from "react";
import type { JobAsset } from "../../lib/asset-store";
import { BOT_FACE_ASSETS, type BotFaceAsset } from "../../lib/bot-assets";
import type {
  Box,
  CtaLayer,
  EditComposition,
  EditLayer,
  FreezeFrameEdit,
  ImageLayer,
  TrimFrameEdit,
  TtsLayer,
  TtsSettings,
  TextOverlayLayer,
  ShapeLayer,
  ZoomLayer,
} from "../../lib/edit-model";
import type { FactoryJob, TemplateRecord } from "../../lib/types";
import {
  isLayerActiveAtFrame,
  outputFrameForSourceFrame,
  rawSourceDurationFrames,
  rawFrameToSourceFrame,
  sourceDurationFrames,
  sourceFrameForOutputFrame,
  sourceFrameToRawFrame,
  trimWindowForComposition,
  withFreezeEdits,
  withTrimEdit,
} from "../../lib/composition-utils";
import { DEFAULT_TTS_INSTRUCTIONS, OPENAI_VOICES } from "../../lib/voice-registry";
import { PreviewLayer } from "./PreviewLayer";
import {
  createAudioLayer,
  createCtaLayer,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  createTtsLayer,
  createZoomLayer,
  shapeLabel,
} from "./editor-layer-factory";

type SaveTarget =
  | {
      kind: "job";
      jobId: string;
      variantId: string;
      compositionUrl: string;
      renderUrl: string;
      openFolderUrl: string;
      ttsUrl: string;
      renderedVideoUrl?: string;
      rawVideoUrl?: string;
      templates: TemplateRecord[];
      assets: JobAsset[];
    }
  | {
      kind: "template";
      templateId: string;
      templateUrl: string;
      initialName: string;
      initialDescription: string;
      initialTags: string[];
    };

type TextLayer = Extract<EditLayer, { text: string }>;
type AudioPreviewLayer = Extract<EditLayer, { kind: "audio-file" | "tts" }>;
type EditorSection =
  | "setup"
  | "quote"
  | "text"
  | "image"
  | "shape"
  | "zoom"
  | "bottom-ad"
  | "voiceover"
  | "sound-effects"
  | "freeze";

export function CompositionWorkspace({
  title,
  subtitle,
  initialComposition,
  target,
}: {
  title: string;
  subtitle: string;
  initialComposition: EditComposition;
  target: SaveTarget;
}) {
  const [composition, setComposition] = useState(initialComposition);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState(
    initialComposition.layers[0]?.id ?? "",
  );
  const [selectedFreezeId, setSelectedFreezeId] = useState("");
  const [jsonDraft, setJsonDraft] = useState(formatJson(initialComposition));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const [dragState, setDragState] = useState<{
    layerId: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startBox: Box;
  } | null>(null);
  const [templateId, setTemplateId] = useState(
    target.kind === "job" ? target.templates[0]?.id ?? "" : "",
  );
  const [templateName, setTemplateName] = useState(
    target.kind === "template" ? target.initialName : "Clankerfights TikTok template",
  );
  const [templateDescription, setTemplateDescription] = useState(
    target.kind === "template" ? target.initialDescription : "",
  );
  const [templateTags, setTemplateTags] = useState(
    target.kind === "template" ? target.initialTags.join(", ") : "clankerfights, tiktok",
  );

  const sortedLayers = useMemo(
    () => [...composition.layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [composition.layers],
  );
  const selectedLayer = useMemo(
    () => composition.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [composition.layers, selectedLayerId],
  );
  const setupLayer = findLayer<TextOverlayLayer>(composition, "opening-caption", "text");
  const quoteLayer = findLayer<TextOverlayLayer>(composition, "quote-caption", "text");
  const adLayer = findLayer<CtaLayer>(composition, "cta", "cta");
  const imageLayer = composition.layers.find(
    (layer): layer is ImageLayer => layer.kind === "image",
  );
  const textLayers = composition.layers.filter(
    (layer): layer is TextOverlayLayer =>
      layer.kind === "text" && layer.id !== "opening-caption" && layer.id !== "quote-caption",
  );
  const shapeLayers = composition.layers.filter(
    (layer): layer is ShapeLayer => layer.kind === "shape",
  );
  const zoomLayers = composition.layers.filter(
    (layer): layer is ZoomLayer => layer.kind === "zoom",
  );
  const ttsLayers = composition.layers.filter(
    (layer): layer is TtsLayer => layer.kind === "tts",
  );
  const audioLayers = composition.layers.filter(
    (layer): layer is Extract<EditLayer, { kind: "audio-file" }> =>
      layer.kind === "audio-file",
  );
  const rawSourceDuration = rawSourceDurationFrames(composition);
  const trimWindow = trimWindowForComposition(composition);
  const sourceDuration = sourceDurationFrames(composition);
  const freezeEdits = composition.timelineEdits?.freezes ?? [];
  const videoStartFrame =
    composition.layers.find((layer) => layer.kind === "video-source")?.time.start ?? 0;
  const activeLayers = useMemo(
    () =>
      sortedLayers.filter(
        (layer) =>
          layer.kind === "video-source" ||
          layer.kind === "audio-file" ||
          layer.kind === "tts" ||
          layer.id === selectedLayerId ||
          isLayerActiveAtFrame(layer, previewFrame),
      ),
    [previewFrame, selectedLayerId, sortedLayers],
  );
  const previewAudioLayers = useMemo(
    () =>
      composition.layers.filter(
        (layer): layer is AudioPreviewLayer =>
          (layer.kind === "audio-file" || layer.kind === "tts") &&
          !layer.hidden &&
          Boolean(layer.src),
      ),
    [composition.layers],
  );
  const previewSourceFrame = sourceFrameForOutputFrame(
    Math.max(0, previewFrame - videoStartFrame),
    freezeEdits,
    sourceDuration,
  );
  const previewRawFrame = sourceFrameToRawFrame(
    previewSourceFrame,
    trimWindow,
    rawSourceDuration,
  );
  const openSection = selectedFreezeId
    ? "freeze"
    : selectedLayer
      ? sectionForLayer(selectedLayer)
      : null;
  const activeZoomLayer = [...zoomLayers]
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
    .find((layer) => isLayerActiveAtFrame(layer, previewFrame));
  const previewVideoTransform = activeZoomLayer
    ? zoomPreviewTransform(activeZoomLayer, previewFrame, composition.canvas)
    : undefined;
  const activeRenderedVideoUrl =
    renderedVideoUrl ?? (target.kind === "job" ? target.renderedVideoUrl ?? null : null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = previewRawFrame / composition.canvas.fps;
    if (Math.abs(video.currentTime - nextTime) > 0.08) {
      video.currentTime = nextTime;
    }
  }, [composition.canvas.fps, previewRawFrame]);

  useEffect(() => {
    if (previewFrame >= composition.canvas.durationFrames) {
      setPreviewFrame(Math.max(0, composition.canvas.durationFrames - 1));
    }
  }, [composition.canvas.durationFrames, previewFrame]);

  useEffect(() => {
    if (!previewPlaying) return;
    let animationFrame = 0;
    let previousTime: number | null = null;

    const step = (time: number) => {
      if (previousTime === null) previousTime = time;
      const elapsedFrames = ((time - previousTime) / 1000) * composition.canvas.fps;
      previousTime = time;
      setPreviewFrame((frame) => {
        const nextFrame = Math.min(
          composition.canvas.durationFrames - 1,
          frame + Math.max(1, Math.round(elapsedFrames)),
        );
        if (nextFrame >= composition.canvas.durationFrames - 1) {
          setPreviewPlaying(false);
        }
        return nextFrame;
      });
      animationFrame = requestAnimationFrame(step);
    };

    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [composition.canvas.durationFrames, composition.canvas.fps, previewPlaying]);

  useEffect(() => {
    for (const layer of previewAudioLayers) {
      const audio = audioRefs.current.get(layer.id);
      if (!audio) continue;

      const active = isLayerActiveAtFrame(layer, previewFrame);
      const localTime = Math.max(0, (previewFrame - layer.time.start) / composition.canvas.fps);
      audio.volume = layer.volume;

      if (!active || !previewPlaying) {
        audio.pause();
        if (!active && previewFrame < layer.time.start) {
          audio.currentTime = 0;
        }
        continue;
      }

      const driftSeconds = Math.abs(audio.currentTime - localTime);
      if ((audio.paused && driftSeconds > 0.05) || driftSeconds > 0.75) {
        audio.currentTime = localTime;
      }
      if (audio.paused) {
        void audio.play().catch(() => {
          setMessage("Click Play preview again if the browser blocks preview audio.");
          setPreviewPlaying(false);
        });
      }
    }
  }, [composition.canvas.fps, previewAudioLayers, previewFrame, previewPlaying]);

  function commitComposition(next: EditComposition) {
    setComposition(next);
    setJsonDraft(formatJson(next));
    if (!next.layers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(next.layers[0]?.id ?? "");
    }
  }

  function updateLayer<T extends EditLayer>(layerId: string, updater: (layer: T) => T) {
    commitComposition({
      ...composition,
      layers: composition.layers.map((layer) =>
        layer.id === layerId ? updater(layer as T) : layer,
      ),
    });
  }

  function selectLayer(layerId: string) {
    setSelectedLayerId(layerId);
    setSelectedFreezeId("");
  }

  function selectFreeze(freezeId: string) {
    setSelectedFreezeId(freezeId);
    setSelectedLayerId("");
  }

  function addSetupLayer() {
    const layer = createTextLayer({
      id: "opening-caption",
      name: "Setup text",
      text: "2026 AI is getting unhinged",
      startFrame: previewFrame,
      preset: "setup",
    });
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addQuoteLayer() {
    const layer = createTextLayer({
      id: "quote-caption",
      name: "Quote",
      text: "Highlighted quote goes here.",
      startFrame: previewFrame,
      preset: "quote",
    });
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addTextLayer() {
    const layer = createTextLayer({ startFrame: previewFrame, preset: "plain" });
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addAdLayer() {
    const layer = createCtaLayer(previewFrame, composition.canvas.durationFrames);
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addImageLayer(asset?: JobAsset) {
    addImageSource({
      name: asset?.name ?? "Image",
      src: asset?.relativePath ?? "assets/images/replace-me.png",
    });
  }

  function addBotFace(asset: BotFaceAsset) {
    addImageSource({
      name: asset.label,
      src: asset.src,
    });
  }

  function addImageSource(input: { name: string; src: string }) {
    const layer = createImageLayer({ ...input, startFrame: previewFrame });
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addAudioLayer(asset: JobAsset) {
    const layer = createAudioLayer(asset, previewFrame);
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addTtsLayer() {
    const layer = createTtsLayer(previewFrame);
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addShapeLayer(shape: ShapeLayer["shape"] = "rect") {
    const layer = createShapeLayer(shape, previewFrame, composition.canvas.durationFrames);
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function addZoomLayer() {
    const layer = createZoomLayer(previewFrame, composition.canvas);
    commitComposition({ ...composition, layers: [...composition.layers, layer] });
    selectLayer(layer.id);
  }

  function deleteLayer(layerId: string) {
    commitComposition({
      ...composition,
      layers: composition.layers.filter((layer) => layer.id !== layerId),
    });
  }

  function updateLayerTiming(layerId: string, patch: Partial<EditLayer["time"]>) {
    updateLayer(
      layerId,
      (layer) =>
        ({
          ...layer,
          time: {
            ...layer.time,
            ...patch,
          },
        }) as EditLayer,
    );
  }

  function addFreezeEdit() {
    const nextFreeze: FreezeFrameEdit = {
      id: `freeze-${Date.now().toString(36)}`,
      atFrame: previewSourceFrame,
      durationFrames: composition.canvas.fps,
    };
    commitComposition(withFreezeEdits(composition, [...freezeEdits, nextFreeze]));
    selectFreeze(nextFreeze.id);
  }

  function updateTrimEdit(patch: Partial<TrimFrameEdit>) {
    const next = withTrimEdit(composition, { ...trimWindow, ...patch });
    commitComposition(next);
  }

  function setPreviewFrameAndVideo(frame: number) {
    const clampedFrame = Math.max(0, Math.min(composition.canvas.durationFrames - 1, frame));
    setPreviewFrame(clampedFrame);
    const video = videoRef.current;
    if (video) {
      video.currentTime =
        sourceFrameToRawFrame(
          sourceFrameForOutputFrame(
            Math.max(0, clampedFrame - videoStartFrame),
            freezeEdits,
            sourceDuration,
          ),
          trimWindow,
          rawSourceDuration,
        ) /
        composition.canvas.fps;
    }
  }

  function syncPreviewFrameFromVideo() {
    const video = videoRef.current;
    if (!video || previewPlaying) return;
    const rawFrame = Math.round(video.currentTime * composition.canvas.fps);
    const sourceFrame = rawFrameToSourceFrame(rawFrame, trimWindow, rawSourceDuration);
    setPreviewFrame(
      Math.min(
        composition.canvas.durationFrames - 1,
        videoStartFrame + outputFrameForSourceFrame(sourceFrame, freezeEdits, sourceDuration),
      ),
    );
  }

  function togglePreviewPlayback() {
    setPreviewPlaying((playing) => !playing);
  }

  function updateFreezeEdit(id: string, patch: Partial<FreezeFrameEdit>) {
    commitComposition(
      withFreezeEdits(
        composition,
        freezeEdits.map((freeze) =>
          freeze.id === id ? { ...freeze, ...patch } : freeze,
        ),
      ),
    );
  }

  function deleteFreezeEdit(id: string) {
    commitComposition(
      withFreezeEdits(
        composition,
        freezeEdits.filter((freeze) => freeze.id !== id),
      ),
    );
    if (selectedFreezeId === id) {
      setSelectedFreezeId("");
    }
  }

  function beginPreviewDrag(
    layer: EditLayer,
    mode: "move" | "resize",
    event: PointerEvent<HTMLElement>,
  ) {
    if (!layer.box || layer.locked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectLayer(layer.id);
    setDragState({
      layerId: layer.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startBox: layer.box,
    });
  }

  function movePreviewDrag(event: PointerEvent<HTMLElement>) {
    if (!dragState) return;
    const scaleX = composition.canvas.width / event.currentTarget.clientWidth;
    const scaleY = composition.canvas.height / event.currentTarget.clientHeight;
    const dx = (event.clientX - dragState.startX) * scaleX;
    const dy = (event.clientY - dragState.startY) * scaleY;
    const nextBox =
      dragState.mode === "move"
        ? {
            ...dragState.startBox,
            x: Math.round(dragState.startBox.x + dx),
            y: Math.round(dragState.startBox.y + dy),
          }
        : resizeBoxForLayer(
            dragState.startBox,
            dx,
            dy,
            composition.layers.find((layer) => layer.id === dragState.layerId),
            composition.canvas,
          );
    updateLayer(dragState.layerId, (layer) => ({ ...layer, box: nextBox }) as EditLayer);
  }

  function endPreviewDrag() {
    setDragState(null);
  }

  async function saveComposition(): Promise<boolean> {
    setBusy("save");
    setMessage(null);
    try {
      const payload =
        target.kind === "job"
          ? { variantId: target.variantId, composition }
          : {
              name: templateName,
              description: templateDescription,
              tags: parseTags(templateTags),
              composition,
            };
      const response = await fetch(
        target.kind === "job" ? target.compositionUrl : target.templateUrl,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Save failed.");
      setMessage("Saved.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function renderJob() {
    if (target.kind !== "job") return;
    const saved = await saveComposition();
    if (!saved) return;
    setBusy("render");
    setMessage(null);
    try {
      const response = await fetch(target.renderUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: target.variantId }),
      });
      const result = (await response.json()) as { job?: FactoryJob; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Render failed.");
      setRenderedVideoUrl(
        result.job?.artifacts.renderedVideoPath && target.kind === "job"
          ? `/api/jobs/${target.jobId}/assets/${target.variantId}.mp4`
          : null,
      );
      setMessage("Render complete. The exported MP4 includes the saved layers.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Render failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openRenderedFolder() {
    if (target.kind !== "job") return;
    setBusy("open-folder");
    setMessage(null);
    try {
      const response = await fetch(target.openFolderUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artifact: "rendered" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not open folder.");
      setMessage("Opened the rendered MP4 folder.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open folder.");
    } finally {
      setBusy(null);
    }
  }

  async function generateTtsForLayer(layer: TextLayer) {
    if (target.kind !== "job") return;
    if (!layer.text.trim()) {
      setMessage("Add text before generating TTS.");
      return;
    }

    const saved = await saveComposition();
    if (!saved) return;

    setBusy("tts");
    setMessage(null);
    try {
      const response = await fetch(target.ttsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variantId: target.variantId,
          layerId: layer.kind === "tts" ? layer.id : `tts-${layer.id}`,
          text: layer.text,
          speaker: layer.kind === "tts" ? layer.speaker : undefined,
          voice: layer.kind === "tts" ? layer.voice : layer.tts?.voice,
          instructions: layer.kind === "tts" ? layer.instructions : layer.tts?.instructions,
          start: layer.time.start,
          duration: layer.time.duration,
          volume: layer.kind === "tts" ? layer.volume : layer.tts?.volume ?? 1,
        }),
      });
      const result = (await response.json()) as {
        job?: { editRecipe: { variants: Array<{ variantId: string; composition?: EditComposition }> } };
        error?: string;
      };
      if (!response.ok || !result.job) throw new Error(result.error ?? "TTS failed.");
      const variant = result.job.editRecipe.variants.find(
        (candidate) => candidate.variantId === target.variantId,
      );
      if (variant?.composition) commitComposition(variant.composition);
      setMessage("TTS added at the same timing as that text.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TTS failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAsTemplate() {
    if (target.kind !== "job") return;
    setBusy("template");
    setMessage(null);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          tags: parseTags(templateTags),
          composition,
        }),
      });
      const result = (await response.json()) as { template?: TemplateRecord; error?: string };
      if (!response.ok || !result.template) {
        throw new Error(result.error ?? "Template save failed.");
      }
      setMessage(`Saved template: ${result.template.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template save failed.");
    } finally {
      setBusy(null);
    }
  }

  function applyTemplate() {
    if (target.kind !== "job") return;
    const template = target.templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    commitComposition(template.composition);
    setMessage(`Loaded template: ${template.name}. Save to apply it to this job.`);
  }

  function applyJsonDraft() {
    try {
      const parsed = JSON.parse(jsonDraft) as EditComposition;
      commitComposition(parsed);
      setMessage("JSON applied locally. Save when it looks right.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid JSON.");
    }
  }

  return (
    <main className="editorShell simpleEditor">
      <header className="editorHeader simpleHeader">
        <div>
          <p className="eyebrow">TikTok factory</p>
          <h1>{title}</h1>
          <p className="editorSubtle">{subtitle}</p>
        </div>
        <div className="editorActions">
          <a className="secondaryButton linkButton" href="/templates">Templates</a>
          <button className="secondaryButton" onClick={saveComposition} disabled={busy !== null}>
            {busy === "save" ? "Saving..." : "Save"}
          </button>
          {target.kind === "job" ? (
            <button className="primaryButton" onClick={renderJob} disabled={busy !== null}>
              {busy === "render" ? "Rendering..." : "Render MP4"}
            </button>
          ) : null}
          {activeRenderedVideoUrl ? (
            <a className="secondaryButton linkButton" href={activeRenderedVideoUrl} target="_blank">
              Open MP4
            </a>
          ) : null}
          {activeRenderedVideoUrl && target.kind === "job" ? (
            <button className="secondaryButton" onClick={openRenderedFolder} disabled={busy !== null}>
              {busy === "open-folder" ? "Opening..." : "Open folder"}
            </button>
          ) : null}
        </div>
      </header>

      {message ? <div className="editorNotice">{message}</div> : null}
      {target.kind === "job" ? (
        <PreviewAudioDeck
          layers={previewAudioLayers}
          jobId={target.jobId}
          audioRefs={audioRefs}
        />
      ) : null}

      <section className="simpleEditorGrid">
        <section className="recipePanel">
          <div className="recipeIntro">
            <h2>Build the clip</h2>
            <p>Most edits are just timed overlays on top of the raw replay.</p>
          </div>

          <CollapsibleSection title="Setup" defaultOpen forceOpen={openSection === "setup"}>
            {setupLayer ? (
              <TextRecipeCard
                title="Setup"
                hint="Opening TikTok text, usually read by TTS."
                layer={setupLayer}
                onFocus={() => selectLayer(setupLayer.id)}
                onChange={(next) => updateLayer<TextOverlayLayer>(setupLayer.id, () => next)}
                onGenerateTts={target.kind === "job" ? () => generateTtsForLayer(setupLayer) : undefined}
                busy={busy}
              />
            ) : (
              <AddOnlyCard
                title="Setup"
                hint="Opening TikTok text, usually read by TTS."
                buttonLabel="Add setup text"
                onAdd={addSetupLayer}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Quote" forceOpen={openSection === "quote"}>
            {quoteLayer ? (
              <TextRecipeCard
                title="Quote"
                hint="The highlighted Clankerfights line or punchline."
                layer={quoteLayer}
                onFocus={() => selectLayer(quoteLayer.id)}
                onChange={(next) => updateLayer<TextOverlayLayer>(quoteLayer.id, () => next)}
                onGenerateTts={target.kind === "job" ? () => generateTtsForLayer(quoteLayer) : undefined}
                busy={busy}
              />
            ) : (
              <AddOnlyCard
                title="Quote"
                hint="The highlighted Clankerfights line or punchline."
                buttonLabel="Add quote text"
                onAdd={addQuoteLayer}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Text" forceOpen={openSection === "text"}>
            <TextLayersCard
              layers={textLayers}
              selectedLayerId={selectedLayerId}
              onAdd={addTextLayer}
              onFocus={selectLayer}
              onChange={(next) => updateLayer<TextOverlayLayer>(next.id, () => next)}
              onGenerate={target.kind === "job" ? generateTtsForLayer : undefined}
              busy={busy}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Image" forceOpen={openSection === "image"}>
            <ImageRecipeCard
              layer={imageLayer}
              assets={target.kind === "job" ? target.assets : []}
              onAdd={() => addImageLayer()}
              onAddAsset={addImageLayer}
              onAddBotFace={addBotFace}
              onFocus={() => imageLayer && selectLayer(imageLayer.id)}
              onChange={(next) => updateLayer<ImageLayer>(next.id, () => next)}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Shape" forceOpen={openSection === "shape"}>
            <ShapeRecipeCard
              layers={shapeLayers}
              selectedLayerId={selectedLayerId}
              onAdd={addShapeLayer}
              onFocus={selectLayer}
              onChange={(next) => updateLayer<ShapeLayer>(next.id, () => next)}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Zoom" forceOpen={openSection === "zoom"}>
            <ZoomRecipeCard
              layers={zoomLayers}
              selectedLayerId={selectedLayerId}
              onAdd={addZoomLayer}
              onFocus={selectLayer}
              onChange={(next) => updateLayer<ZoomLayer>(next.id, () => next)}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Bottom Ad" forceOpen={openSection === "bottom-ad"}>
            {adLayer ? (
              <AdRecipeCard
                layer={adLayer}
                onFocus={() => selectLayer(adLayer.id)}
                onChange={(next) => updateLayer<CtaLayer>(adLayer.id, () => next)}
                onGenerateTts={target.kind === "job" ? () => generateTtsForLayer(adLayer) : undefined}
                busy={busy}
              />
            ) : (
              <AddOnlyCard
                title="Bottom ad"
                hint="Persistent clankerfights.ai CTA at the bottom."
                buttonLabel="Add bottom ad"
                onAdd={addAdLayer}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Voiceover" forceOpen={openSection === "voiceover"}>
            <TtsVoiceoverCard
              layers={ttsLayers}
              selectedLayerId={selectedLayerId}
              onAdd={addTtsLayer}
              onFocus={selectLayer}
              onChange={(next) => updateLayer<TtsLayer>(next.id, () => next)}
              onGenerate={target.kind === "job" ? generateTtsForLayer : undefined}
              busy={busy}
              jobId={target.kind === "job" ? target.jobId : undefined}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Sound Effects" forceOpen={openSection === "sound-effects"}>
            <SoundEffectsCard
              assets={target.kind === "job" ? target.assets : []}
              layers={audioLayers}
              selectedLayerId={selectedLayerId}
              onAddAudio={addAudioLayer}
              onFocus={selectLayer}
              onChange={(next) => updateLayer<Extract<EditLayer, { kind: "audio-file" }>>(next.id, () => next)}
              jobId={target.kind === "job" ? target.jobId : undefined}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Freeze Frames" forceOpen={openSection === "freeze"}>
            <FreezeEditor
              fps={composition.canvas.fps}
              sourceDuration={sourceDuration}
              freezes={freezeEdits}
              selectedFreezeId={selectedFreezeId}
              onAdd={addFreezeEdit}
              onSelect={selectFreeze}
              onChange={updateFreezeEdit}
              onDelete={deleteFreezeEdit}
            />
          </CollapsibleSection>

          <details className="simpleDetails">
            <summary>Templates and assets</summary>
            {target.kind === "job" ? (
              <div className="templateBox compactBox">
                <label>
                  <span>Apply template</span>
                  <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                    <option value="">Choose a saved template</option>
                    {target.templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="secondaryButton" onClick={applyTemplate} disabled={!templateId}>
                  Apply
                </button>
                <div className="boxGrid">
                  <TextInput label="Template name" value={templateName} onChange={setTemplateName} />
                  <TextInput label="Tags" value={templateTags} onChange={setTemplateTags} />
                </div>
                <TextInput label="Description" value={templateDescription} onChange={setTemplateDescription} />
                <button className="secondaryButton" onClick={saveAsTemplate} disabled={busy !== null}>
                  Save current edit as template
                </button>
                <AssetList
                  assets={target.assets}
                  onAddImage={addImageLayer}
                  onAddAudio={addAudioLayer}
                />
              </div>
            ) : (
              <div className="templateBox compactBox">
                <TextInput label="Template name" value={templateName} onChange={setTemplateName} />
                <TextInput label="Description" value={templateDescription} onChange={setTemplateDescription} />
                <TextInput label="Tags" value={templateTags} onChange={setTemplateTags} />
              </div>
            )}
          </details>
        </section>

        <section className="previewColumn">
          <div className="phonePreview">
            <div
              className="previewCanvas"
              style={{ background: composition.canvas.background }}
              onPointerMove={movePreviewDrag}
              onPointerUp={endPreviewDrag}
              onPointerCancel={endPreviewDrag}
            >
              {target.kind === "job" && target.rawVideoUrl ? (
                <video
                  ref={videoRef}
                  className="rawPreviewVideo"
                  src={target.rawVideoUrl}
                  muted
                  playsInline
                  style={previewVideoTransform}
                  onTimeUpdate={syncPreviewFrameFromVideo}
                  onEnded={() => setPreviewPlaying(false)}
                />
              ) : null}
              {activeLayers.map((layer) => (
                <PreviewLayer
                  key={layer.id}
                  layer={layer}
                  canvas={composition.canvas}
                  active={selectedLayerId === layer.id}
                  onPointerDown={(mode, event) => beginPreviewDrag(layer, mode, event)}
                />
              ))}
            </div>
          </div>
          <section className="sliderPanel">
            <div className="panelTitle">
              <h2>Video time</h2>
              <span>
                {framesToSeconds(previewFrame, composition.canvas.fps)}s final /
                {" "}
                {framesToSeconds(previewRawFrame, composition.canvas.fps)}s raw
              </span>
            </div>
            <button
              className="secondaryButton previewPlaybackButton"
              onClick={togglePreviewPlayback}
              disabled={target.kind !== "job" || !target.rawVideoUrl}
            >
              {previewPlaying ? "Pause preview" : "Play preview"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, composition.canvas.durationFrames - 1)}
              value={previewFrame}
              onChange={(event) => setPreviewFrameAndVideo(Number(event.target.value))}
            />
          </section>
          <Timeline
            layers={sortedLayers}
            freezes={freezeEdits}
            durationFrames={composition.canvas.durationFrames}
            selectedLayerId={selectedLayerId}
            selectedFreezeId={selectedFreezeId}
            fps={composition.canvas.fps}
            onSelect={selectLayer}
            onSelectFreeze={selectFreeze}
          />
          <LayerTimingSliders
            layers={sortedLayers}
            durationFrames={composition.canvas.durationFrames}
            selectedLayerId={selectedLayerId}
            onSelect={selectLayer}
            onChange={updateLayerTiming}
          />
          <TrimEditor
            fps={composition.canvas.fps}
            rawSourceDuration={rawSourceDuration}
            trim={trimWindow}
            onChange={updateTrimEdit}
          />
        </section>

        <aside className="editorPane quickInspector">
          <h2>Selected layer</h2>
          {selectedLayer ? (
            <Inspector
              layer={selectedLayer}
              onChange={(patch) =>
                updateLayer(selectedLayer.id, (layer) => ({ ...layer, ...patch }) as EditLayer)
              }
              onDelete={() => deleteLayer(selectedLayer.id)}
              onGenerateTts={
                target.kind === "job" && "text" in selectedLayer
                  ? () => generateTtsForLayer(selectedLayer)
                  : undefined
              }
              busy={busy}
            />
          ) : (
            <p className="editorSubtle">Select a layer.</p>
          )}

          <button
            className="secondaryButton advancedToggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Hide advanced JSON" : "Show advanced JSON"}
          </button>

          {showAdvanced ? (
            <div className="jsonPanel">
              <div className="panelTitle">
                <h2>JSON</h2>
                <div>
                  <button className="chipButton" onClick={() => setJsonDraft(formatJson(composition))}>
                    Revert
                  </button>
                  <button className="chipButton" onClick={applyJsonDraft}>
                    Apply
                  </button>
                </div>
              </div>
              <textarea
                value={jsonDraft}
                onChange={(event) => setJsonDraft(event.target.value)}
                spellCheck={false}
              />
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function TextRecipeCard({
  title,
  hint,
  layer,
  onChange,
  onFocus,
  onGenerateTts,
  busy,
}: {
  title: string;
  hint: string;
  layer: TextOverlayLayer;
  onChange: (layer: TextOverlayLayer) => void;
  onFocus: () => void;
  onGenerateTts?: () => void;
  busy: string | null;
}) {
  return (
    <article className="recipeCard" onFocus={onFocus}>
      <div className="recipeCardTop">
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        {onGenerateTts ? (
          <button className="chipButton" onClick={onGenerateTts} disabled={busy !== null}>
            {busy === "tts" ? "Voice..." : "TTS"}
          </button>
        ) : null}
      </div>
      <label>
        <span>Text</span>
        <textarea
          className="compactTextarea"
          value={layer.text}
          onChange={(event) => onChange({ ...layer, text: event.target.value })}
        />
      </label>
      <TimingFields layer={layer} onChange={onChange} />
      <BoxFields layer={layer} onChange={onChange} />
      <div className="boxGrid">
        <NumberInput
          label="Font"
          value={layer.style.fontSize}
          onChange={(fontSize) => onChange({ ...layer, style: { ...layer.style, fontSize } })}
        />
        <TextInput
          label="Color"
          value={layer.style.color}
          onChange={(color) => onChange({ ...layer, style: { ...layer.style, color } })}
        />
      </div>
      <TtsControls
        settings={layer.tts}
        onChange={(tts) => onChange({ ...layer, tts })}
      />
    </article>
  );
}

function AddOnlyCard({
  title,
  hint,
  buttonLabel,
  onAdd,
}: {
  title: string;
  hint: string;
  buttonLabel: string;
  onAdd: () => void;
}) {
  return (
    <article className="recipeCard">
      <div className="recipeCardTop">
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        <button className="chipButton" onClick={onAdd}>
          {buttonLabel}
        </button>
      </div>
    </article>
  );
}

function TextLayersCard({
  layers,
  selectedLayerId,
  onAdd,
  onFocus,
  onChange,
  onGenerate,
  busy,
}: {
  layers: TextOverlayLayer[];
  selectedLayerId: string;
  onAdd: () => void;
  onFocus: (layerId: string) => void;
  onChange: (layer: TextOverlayLayer) => void;
  onGenerate?: (layer: TextOverlayLayer) => void;
  busy: string | null;
}) {
  const selected = layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];
  return (
    <article className="recipeCard">
      <div className="recipeCardTop">
        <div>
          <h3>Text</h3>
          <p>Reusable overlay text with timing, size, color, and position controls.</p>
        </div>
        <button className="chipButton" onClick={onAdd}>
          Add
        </button>
      </div>
      {layers.length > 0 ? (
        <div className="assetChips">
          {layers.map((layer) => (
            <button
              key={layer.id}
              className={`chipButton ${layer.id === selectedLayerId ? "selectedChip" : ""}`}
              onClick={() => onFocus(layer.id)}
            >
              {layer.name ?? "Text"}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <>
          <TextInput
            label="Name"
            value={selected.name ?? ""}
            onChange={(name) => onChange({ ...selected, name })}
          />
          <label>
            <span>Text</span>
            <textarea
              className="compactTextarea"
              value={selected.text}
              onChange={(event) => onChange({ ...selected, text: event.target.value })}
            />
          </label>
          <TimingFields layer={selected} onChange={onChange} />
          <BoxFields layer={selected} onChange={onChange} />
          <div className="boxGrid">
            <NumberInput
              label="Font"
              value={selected.style.fontSize}
              onChange={(fontSize) =>
                onChange({ ...selected, style: { ...selected.style, fontSize } })
              }
            />
            <NumberInput
              label="Line height"
              value={selected.style.lineHeight}
              step={0.05}
              onChange={(lineHeight) =>
                onChange({ ...selected, style: { ...selected.style, lineHeight } })
              }
            />
            <TextInput
              label="Color"
              value={selected.style.color}
              onChange={(color) => onChange({ ...selected, style: { ...selected.style, color } })}
            />
            <TextInput
              label="Background"
              value={selected.style.background ?? ""}
              onChange={(background) =>
                onChange({
                  ...selected,
                  style: { ...selected.style, background: background || undefined },
                })
              }
            />
          </div>
          <TtsControls
            settings={selected.tts}
            onChange={(tts) => onChange({ ...selected, tts })}
          />
          {onGenerate ? (
            <button className="secondaryButton" onClick={() => onGenerate(selected)} disabled={busy !== null}>
              {busy === "tts" ? "Generating..." : "Generate TTS"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="editorSubtle">Add a text layer, then drag it on the video and adjust its timing below.</p>
      )}
    </article>
  );
}

function PreviewAudioDeck({
  layers,
  jobId,
  audioRefs,
}: {
  layers: Array<Extract<EditLayer, { kind: "audio-file" | "tts" }>>;
  jobId: string;
  audioRefs: MutableRefObject<Map<string, HTMLAudioElement>>;
}) {
  return (
    <div className="previewAudioDeck" aria-hidden="true">
      {layers.map((layer) => {
        const src = audioPreviewUrl(layer.src, jobId);
        if (!src) return null;
        return (
          <audio
            key={`${layer.id}:${src}`}
            ref={(element) => {
              if (element) {
                audioRefs.current.set(layer.id, element);
              } else {
                audioRefs.current.delete(layer.id);
              }
            }}
            src={src}
            preload="auto"
          />
        );
      })}
    </div>
  );
}

function AudioPreviewButton({
  src,
  label,
}: {
  src: string | null | undefined;
  label: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  if (!src) {
    return <p className="editorSubtle">No generated audio yet.</p>;
  }

  return (
    <div className="audioPreviewButton">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
      />
      <button className="chipButton" onClick={toggle}>
        {playing ? "Pause" : label}
      </button>
      <span className="audioLength">
        {duration && Number.isFinite(duration) ? `${roundTenths(duration)}s` : "loading length"}
      </span>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="recipeSection" open={defaultOpen || forceOpen}>
      <summary>{title}</summary>
      <div className="recipeSectionBody">{children}</div>
    </details>
  );
}

function ImageRecipeCard({
  layer,
  assets,
  onAdd,
  onAddAsset,
  onAddBotFace,
  onFocus,
  onChange,
}: {
  layer?: ImageLayer;
  assets: JobAsset[];
  onAdd: () => void;
  onAddAsset: (asset: JobAsset) => void;
  onAddBotFace: (asset: BotFaceAsset) => void;
  onFocus: () => void;
  onChange: (layer: ImageLayer) => void;
}) {
  const images = assets.filter((asset) => asset.kind === "image");
  return (
    <article className="recipeCard" onFocus={onFocus}>
      <div className="recipeCardTop">
        <div>
          <h3>3. Image</h3>
          <p>Optional meme, logo, or visual reference layer.</p>
        </div>
        {!layer ? (
          <button className="chipButton" onClick={onAdd}>
            Add
          </button>
        ) : null}
      </div>
      {layer ? (
        <>
          <TextInput label="Image source" value={layer.src} onChange={(src) => onChange({ ...layer, src })} />
          <TimingFields layer={layer} onChange={onChange} />
          <BoxFields layer={layer} onChange={onChange} />
          <label className="inlineCheck">
            <input
              type="checkbox"
              checked={Boolean(layer.flipX)}
              onChange={(event) => onChange({ ...layer, flipX: event.target.checked })}
            />
            <span>Flip horizontally</span>
          </label>
        </>
      ) : (
        <p className="editorSubtle">Add an image by path, or use an image asset from this job.</p>
      )}
      {images.length > 0 ? (
        <div className="assetChips">
          {images.map((asset) => (
            <button key={asset.relativePath} className="chipButton" onClick={() => onAddAsset(asset)}>
              {asset.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="assetChips">
        {BOT_FACE_ASSETS.map((asset) => (
          <button key={asset.id} className="faceChip" onClick={() => onAddBotFace(asset)}>
            <img src={asset.previewUrl} alt="" />
            <span>{asset.label}</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function ShapeRecipeCard({
  layers,
  selectedLayerId,
  onAdd,
  onFocus,
  onChange,
}: {
  layers: ShapeLayer[];
  selectedLayerId: string;
  onAdd: (shape: ShapeLayer["shape"]) => void;
  onFocus: (layerId: string) => void;
  onChange: (layer: ShapeLayer) => void;
}) {
  const selected =
    layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];

  return (
    <article className="recipeCard">
      <div className="recipeCardTop">
        <div>
          <h3>Shape</h3>
          <p>Draw a box, circle, line, or arrow over the video.</p>
        </div>
      </div>
      <div className="assetChips">
        {(["rect", "ellipse", "line", "arrow"] as const).map((shape) => (
          <button key={shape} className="chipButton" onClick={() => onAdd(shape)}>
            + {shapeLabel(shape)}
          </button>
        ))}
      </div>
      {layers.length > 0 ? (
        <div className="assetChips">
          {layers.map((layer) => (
            <button
              key={layer.id}
              className={`chipButton ${layer.id === selectedLayerId ? "selectedChip" : ""}`}
              onClick={() => onFocus(layer.id)}
            >
              {layer.name ?? shapeLabel(layer.shape)}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <>
          <label>
            <span>Shape</span>
            <select
              value={selected.shape}
              onChange={(event) =>
                onChange({
                  ...selected,
                  shape: event.target.value as ShapeLayer["shape"],
                })
              }
            >
              <option value="rect">Box</option>
              <option value="ellipse">Circle</option>
              <option value="line">Line</option>
              <option value="arrow">Arrow</option>
            </select>
          </label>
          <TimingFields layer={selected} onChange={onChange} />
          <BoxFields layer={selected} onChange={onChange} />
          <div className="boxGrid">
            <TextInput
              label="Stroke"
              value={selected.style.stroke ?? ""}
              onChange={(stroke) => onChange({ ...selected, style: { ...selected.style, stroke } })}
            />
            <TextInput
              label="Fill"
              value={selected.style.fill}
              onChange={(fill) => onChange({ ...selected, style: { ...selected.style, fill } })}
            />
            <NumberInput
              label="Thickness"
              value={selected.style.strokeWidth ?? 8}
              onChange={(strokeWidth) => onChange({ ...selected, style: { ...selected.style, strokeWidth } })}
            />
            <NumberInput
              label="Opacity"
              value={selected.style.opacity ?? 1}
              step={0.1}
              onChange={(opacity) => onChange({ ...selected, style: { ...selected.style, opacity } })}
            />
          </div>
        </>
      ) : (
        <p className="editorSubtle">Add a shape, then drag or resize it directly on the video.</p>
      )}
    </article>
  );
}

function ZoomRecipeCard({
  layers,
  selectedLayerId,
  onAdd,
  onFocus,
  onChange,
}: {
  layers: ZoomLayer[];
  selectedLayerId: string;
  onAdd: () => void;
  onFocus: (layerId: string) => void;
  onChange: (layer: ZoomLayer) => void;
}) {
  const selected = layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];

  return (
    <article className="recipeCard">
      <div className="recipeCardTop">
        <div>
          <h3>Zoom</h3>
          <p>Draw a 9:16 rectangle, then the video zooms out from that selection.</p>
        </div>
        <button className="chipButton" onClick={onAdd}>
          Add zoom
        </button>
      </div>
      {layers.length > 0 ? (
        <div className="assetChips">
          {layers.map((layer) => (
            <button
              key={layer.id}
              className={`chipButton ${layer.id === selectedLayerId ? "selectedChip" : ""}`}
              onClick={() => onFocus(layer.id)}
            >
              {layer.name ?? "Zoom"}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <>
          <TextInput
            label="Name"
            value={selected.name ?? ""}
            onChange={(name) => onChange({ ...selected, name })}
          />
          <TimingFields layer={selected} onChange={onChange} />
          <BoxFields layer={selected} onChange={(next) => onChange(lockZoomAspect(next))} />
          <label>
            <span>Easing</span>
            <select
              value={selected.easing ?? "easeOut"}
              onChange={(event) =>
                onChange({ ...selected, easing: event.target.value as ZoomLayer["easing"] })
              }
            >
              <option value="easeOut">Ease out</option>
              <option value="easeInOut">Ease in/out</option>
              <option value="linear">Linear</option>
            </select>
          </label>
          <p className="editorSubtle">
            Drag the rectangle on the preview. Resize keeps the same 9:16 shape as the video.
          </p>
        </>
      ) : (
        <p className="editorSubtle">Add a zoom layer, then resize the rectangle over the part to punch in on.</p>
      )}
    </article>
  );
}

function TtsVoiceoverCard({
  layers,
  selectedLayerId,
  onAdd,
  onFocus,
  onChange,
  onGenerate,
  busy,
  jobId,
}: {
  layers: TtsLayer[];
  selectedLayerId: string;
  onAdd: () => void;
  onFocus: (layerId: string) => void;
  onChange: (layer: TtsLayer) => void;
  onGenerate?: (layer: TtsLayer) => void;
  busy: string | null;
  jobId?: string;
}) {
  const selected = layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];

  return (
    <article className="recipeCard">
      <div className="recipeCardTop">
        <div>
          <h3>Voiceover</h3>
          <p>Audio-only TTS. It says anything you type and displays nothing.</p>
        </div>
        <button className="chipButton" onClick={onAdd}>
          Add
        </button>
      </div>
      {layers.length > 0 ? (
        <div className="assetChips">
          {layers.map((layer) => (
            <button
              key={layer.id}
              className={`chipButton ${layer.id === selectedLayerId ? "selectedChip" : ""}`}
              onClick={() => onFocus(layer.id)}
            >
              {layer.name ?? "Voiceover"}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <>
          <TextInput
            label="Name"
            value={selected.name ?? ""}
            onChange={(name) => onChange({ ...selected, name })}
          />
          <label>
            <span>Script</span>
            <textarea
              className="compactTextarea"
              value={selected.text}
              onChange={(event) =>
                onChange(clearTtsAudio({ ...selected, text: event.target.value }))
              }
            />
          </label>
          <TimingFields layer={selected} onChange={onChange} />
          <TtsLayerControls
            layer={selected}
            onChange={(next) => onChange(clearTtsAudio(next))}
          />
          {selected.src ? (
            <AudioPreviewButton
              src={jobId ? audioPreviewUrl(selected.src, jobId) : selected.src}
              label="Play TTS"
            />
          ) : (
            <p className="editorSubtle">Generate audio before rendering if you want this layer to be heard.</p>
          )}
          {onGenerate ? (
            <button
              className="secondaryButton"
              onClick={() => onGenerate(selected)}
              disabled={busy !== null || !selected.text.trim()}
            >
              {busy === "tts" ? "Generating..." : selected.src ? "Regenerate audio" : "Generate audio"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="editorSubtle">Add a voiceover layer, then set when it starts and how long it lasts.</p>
      )}
    </article>
  );
}

function SoundEffectsCard({
  assets,
  layers,
  selectedLayerId,
  onAddAudio,
  onFocus,
  onChange,
  jobId,
}: {
  assets: JobAsset[];
  layers: Array<Extract<EditLayer, { kind: "audio-file" }>>;
  selectedLayerId: string;
  onAddAudio: (asset: JobAsset) => void;
  onFocus: (layerId: string) => void;
  onChange: (layer: Extract<EditLayer, { kind: "audio-file" }>) => void;
  jobId?: string;
}) {
  const audioAssets = assets.filter((asset) => asset.kind === "audio");
  const selected = layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];
  return (
    <article className="recipeCard">
      <div className="recipeCardTop">
        <div>
          <h3>Sound Effects</h3>
          <p>Drop shared audio files into assets/sound-effects and add them here.</p>
        </div>
      </div>
      {layers.length > 0 ? (
        <div className="assetChips">
          {layers.map((layer) => (
            <button
              key={layer.id}
              className={`chipButton ${layer.id === selectedLayerId ? "selectedChip" : ""}`}
              onClick={() => onFocus(layer.id)}
            >
              {layer.name ?? "Sound"}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <>
          <TextInput
            label="Name"
            value={selected.name ?? ""}
            onChange={(name) => onChange({ ...selected, name })}
          />
          <TimingFields layer={selected} onChange={onChange} />
          <NumberInput
            label="Volume"
            value={selected.volume}
            step={0.1}
            onChange={(volume) => onChange({ ...selected, volume })}
          />
          <AudioPreviewButton
            src={jobId ? audioPreviewUrl(selected.src, jobId) : selected.src}
            label="Play sound"
          />
        </>
      ) : null}
      {audioAssets.length === 0 ? (
        <p className="editorSubtle">No sound effects yet. Put mp3, wav, m4a, or aac files in assets/sound-effects.</p>
      ) : (
        <div className="assetChips">
          {audioAssets.map((asset) => (
            <div key={asset.relativePath} className="assetChipWithPreview">
              <button className="chipButton" onClick={() => onAddAudio(asset)}>
                Add {asset.name}
              </button>
              <AudioPreviewButton
                src={jobId ? audioPreviewUrl(asset.relativePath, jobId) : asset.relativePath}
                label="Play"
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function AdRecipeCard({
  layer,
  onChange,
  onFocus,
  onGenerateTts,
  busy,
}: {
  layer: CtaLayer;
  onChange: (layer: CtaLayer) => void;
  onFocus: () => void;
  onGenerateTts?: () => void;
  busy: string | null;
}) {
  return (
    <article className="recipeCard" onFocus={onFocus}>
      <div className="recipeCardTop">
        <div>
          <h3>4. Bottom ad</h3>
          <p>Persistent clankerfights.ai CTA at the bottom.</p>
        </div>
        {onGenerateTts ? (
          <button className="chipButton" onClick={onGenerateTts} disabled={busy !== null}>
            {busy === "tts" ? "Voice..." : "TTS"}
          </button>
        ) : null}
      </div>
      <TextInput label="Ad text" value={layer.text} onChange={(text) => onChange({ ...layer, text })} />
      <TimingFields layer={layer} onChange={onChange} />
      <BoxFields layer={layer} onChange={onChange} />
      <div className="boxGrid">
        <TextInput
          label="Background"
          value={layer.style.background}
          onChange={(background) => onChange({ ...layer, style: { ...layer.style, background } })}
        />
        <TextInput
          label="Color"
          value={layer.style.color}
          onChange={(color) => onChange({ ...layer, style: { ...layer.style, color } })}
        />
      </div>
      <TtsControls
        settings={layer.tts}
        onChange={(tts) => onChange({ ...layer, tts })}
      />
    </article>
  );
}

function TtsControls({
  settings,
  onChange,
}: {
  settings?: TtsSettings;
  onChange: (settings: TtsSettings) => void;
}) {
  const next = {
    voice: settings?.voice ?? "coral",
    instructions: settings?.instructions ?? DEFAULT_TTS_INSTRUCTIONS,
    volume: settings?.volume ?? 1,
  };

  return (
    <details className="ttsDetails">
      <summary>OpenAI voice settings</summary>
      <div className="ttsGrid">
        <label>
          <span>Voice</span>
          <select
            value={next.voice}
            onChange={(event) => onChange({ ...next, voice: event.target.value })}
          >
            {OPENAI_VOICES.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </select>
        </label>
        <NumberInput
          label="Volume"
          value={next.volume}
          step={0.1}
          onChange={(volume) => onChange({ ...next, volume })}
        />
        <label className="ttsInstructions">
          <span>Voice description</span>
          <textarea
            className="compactTextarea"
            value={next.instructions}
            onChange={(event) => onChange({ ...next, instructions: event.target.value })}
            placeholder="Affect: ...&#10;Tone: ...&#10;Emotion: ...&#10;Pronunciation: ...&#10;Pause: ..."
          />
        </label>
      </div>
    </details>
  );
}

function TtsLayerControls({
  layer,
  onChange,
}: {
  layer: TtsLayer;
  onChange: (layer: TtsLayer) => void;
}) {
  return (
    <div className="ttsGrid">
      <label>
        <span>Voice</span>
        <select
          value={layer.voice}
          onChange={(event) => onChange({ ...layer, voice: event.target.value })}
        >
          {OPENAI_VOICES.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
        </select>
      </label>
      <NumberInput
        label="Volume"
        value={layer.volume}
        step={0.1}
        onChange={(volume) => onChange({ ...layer, volume })}
      />
      <label className="ttsInstructions">
        <span>Voice description</span>
        <textarea
          className="compactTextarea"
          value={layer.instructions ?? ""}
          onChange={(event) => onChange({ ...layer, instructions: event.target.value })}
          placeholder="Affect: ...&#10;Tone: ...&#10;Emotion: ...&#10;Pronunciation: ...&#10;Pause: ..."
        />
      </label>
    </div>
  );
}

function TimingFields<T extends EditLayer>({
  layer,
  onChange,
}: {
  layer: T;
  onChange: (layer: T) => void;
}) {
  return (
    <div className="boxGrid">
      <NumberInput
        label="Start frame"
        value={layer.time.start}
        onChange={(start) => onChange({ ...layer, time: { ...layer.time, start } })}
      />
      <NumberInput
        label="Duration"
        value={layer.time.duration}
        onChange={(duration) => onChange({ ...layer, time: { ...layer.time, duration } })}
      />
    </div>
  );
}

function BoxFields<T extends EditLayer & { box: Box }>({
  layer,
  onChange,
}: {
  layer: T;
  onChange: (layer: T) => void;
}) {
  return (
    <div className="boxGrid">
      <NumberInput label="X" value={layer.box.x} onChange={(x) => onChange({ ...layer, box: { ...layer.box, x } })} />
      <NumberInput label="Y" value={layer.box.y} onChange={(y) => onChange({ ...layer, box: { ...layer.box, y } })} />
      <NumberInput label="W" value={layer.box.width} onChange={(width) => onChange({ ...layer, box: { ...layer.box, width } })} />
      <NumberInput label="H" value={layer.box.height} onChange={(height) => onChange({ ...layer, box: { ...layer.box, height } })} />
    </div>
  );
}

function Inspector({
  layer,
  onChange,
  onDelete,
  onGenerateTts,
  busy,
}: {
  layer: EditLayer;
  onChange: (patch: Partial<EditLayer>) => void;
  onDelete: () => void;
  onGenerateTts?: () => void;
  busy: string | null;
}) {
  return (
    <div className="inspectorFields">
      <TextInput label="Name" value={layer.name ?? ""} onChange={(name) => onChange({ name } as Partial<EditLayer>)} />
      <TimingPatchFields layer={layer} onChange={onChange} />
      <NumberInput label="Layer order" value={layer.zIndex ?? 0} onChange={(zIndex) => onChange({ zIndex } as Partial<EditLayer>)} />
      <label className="inlineCheck">
        <input type="checkbox" checked={Boolean(layer.hidden)} onChange={(event) => onChange({ hidden: event.target.checked } as Partial<EditLayer>)} />
        <span>Hidden</span>
      </label>
      {"text" in layer ? (
        <label>
          <span>Text</span>
          <textarea
            className="compactTextarea"
            value={layer.text}
            onChange={(event) => onChange({ text: event.target.value } as Partial<EditLayer>)}
          />
        </label>
      ) : null}
      {layer.kind === "image" ? (
        <label className="inlineCheck">
          <input
            type="checkbox"
            checked={Boolean(layer.flipX)}
            onChange={(event) => onChange({ flipX: event.target.checked } as Partial<EditLayer>)}
          />
          <span>Flip horizontally</span>
        </label>
      ) : null}
      {onGenerateTts ? (
        <button className="secondaryButton" onClick={onGenerateTts} disabled={busy !== null}>
          {busy === "tts" ? "Generating..." : "Generate TTS"}
        </button>
      ) : null}
      <button className="dangerButton" onClick={onDelete}>
        Delete layer
      </button>
    </div>
  );
}

function TimingPatchFields({
  layer,
  onChange,
}: {
  layer: EditLayer;
  onChange: (patch: Partial<EditLayer>) => void;
}) {
  return (
    <div className="boxGrid">
      <NumberInput
        label="Start frame"
        value={layer.time.start}
        onChange={(start) => onChange({ time: { ...layer.time, start } } as Partial<EditLayer>)}
      />
      <NumberInput
        label="Duration"
        value={layer.time.duration}
        onChange={(duration) => onChange({ time: { ...layer.time, duration } } as Partial<EditLayer>)}
      />
    </div>
  );
}

function AssetList({
  assets,
  onAddImage,
  onAddAudio,
}: {
  assets: JobAsset[];
  onAddImage: (asset: JobAsset) => void;
  onAddAudio: (asset: JobAsset) => void;
}) {
  return (
    <div className="assetList">
      {assets.length === 0 ? (
        <p className="editorSubtle">No job assets yet.</p>
      ) : (
        assets.map((asset) => (
          <div className="assetRow" key={asset.relativePath}>
            <div>
              <span>{asset.name}</span>
              <small>{asset.kind} / {Math.ceil(asset.sizeBytes / 1024)} KB</small>
            </div>
            {asset.kind === "image" ? (
              <button className="chipButton" onClick={() => onAddImage(asset)}>
                Add image
              </button>
            ) : null}
            {asset.kind === "audio" ? (
              <button className="chipButton" onClick={() => onAddAudio(asset)}>
                Add audio
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function Timeline({
  layers,
  freezes,
  durationFrames,
  selectedLayerId,
  selectedFreezeId,
  fps,
  onSelect,
  onSelectFreeze,
}: {
  layers: EditLayer[];
  freezes: FreezeFrameEdit[];
  durationFrames: number;
  selectedLayerId: string;
  selectedFreezeId: string;
  fps: number;
  onSelect: (layerId: string) => void;
  onSelectFreeze: (freezeId: string) => void;
}) {
  return (
    <div className="timeline">
      {layers.map((layer) => {
        const left = (layer.time.start / durationFrames) * 100;
        const width = (layer.time.duration / durationFrames) * 100;
        return (
          <button
            key={layer.id}
            className={`timelineTrack ${selectedLayerId === layer.id ? "selected" : ""}`}
            onClick={() => onSelect(layer.id)}
          >
            <span className="trackLabel">{friendlyLayerName(layer)}</span>
            <span
              className={`trackBar ${layer.kind}`}
              style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
            />
          </button>
        );
      })}
      {freezes.map((freeze) => {
        const left = (freeze.atFrame / durationFrames) * 100;
        const width = (freeze.durationFrames / durationFrames) * 100;
        return (
          <button
            key={freeze.id}
            className={`timelineTrack ${selectedFreezeId === freeze.id ? "selected" : ""}`}
            onClick={() => onSelectFreeze(freeze.id)}
          >
            <span className="trackLabel">Freeze at {framesToSeconds(freeze.atFrame, fps)}s</span>
            <span
              className="trackBar freeze"
              style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

function LayerTimingSliders({
  layers,
  durationFrames,
  selectedLayerId,
  onSelect,
  onChange,
}: {
  layers: EditLayer[];
  durationFrames: number;
  selectedLayerId: string;
  onSelect: (layerId: string) => void;
  onChange: (layerId: string, patch: Partial<EditLayer["time"]>) => void;
}) {
  const editableLayers = layers.filter(
    (layer) => layer.kind !== "video-source",
  );

  return (
    <section className="sliderPanel">
      <div className="panelTitle">
        <h2>Layer timing</h2>
        <span>{Math.round(durationFrames / 30)}s total</span>
      </div>
      {editableLayers.map((layer) => (
        <div
          className={`sliderRow ${selectedLayerId === layer.id ? "selected" : ""}`}
          key={layer.id}
          onFocus={() => onSelect(layer.id)}
        >
          <button className="sliderLayerName" onClick={() => onSelect(layer.id)}>
            {friendlyLayerName(layer)}
          </button>
          <label>
            <span>Starts at {framesToSeconds(layer.time.start)}s</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, durationFrames - 1)}
              value={layer.time.start}
              onChange={(event) =>
                onChange(layer.id, { start: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span>Stays for {framesToSeconds(layer.time.duration)}s</span>
            <input
              type="range"
              min={1}
              max={durationFrames}
              value={layer.time.duration}
              onChange={(event) =>
                onChange(layer.id, { duration: Number(event.target.value) })
              }
            />
          </label>
        </div>
      ))}
    </section>
  );
}

function TrimEditor({
  fps,
  rawSourceDuration,
  trim,
  onChange,
}: {
  fps: number;
  rawSourceDuration: number;
  trim: TrimFrameEdit;
  onChange: (patch: Partial<TrimFrameEdit>) => void;
}) {
  return (
    <section className="sliderPanel">
      <div className="panelTitle">
        <div>
          <h2>Trim video</h2>
          <p className="editorSubtle">Choose which part of the raw MP4 becomes the final base clip.</p>
        </div>
        <span>{framesToSeconds(trim.endFrame - trim.startFrame, fps)}s kept</span>
      </div>
      <div className="sliderRow">
        <label>
          <span>Start at {framesToSeconds(trim.startFrame, fps)}s</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, trim.endFrame - 1)}
            value={trim.startFrame}
            onChange={(event) => onChange({ startFrame: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>End at {framesToSeconds(trim.endFrame, fps)}s</span>
          <input
            type="range"
            min={Math.min(rawSourceDuration, trim.startFrame + 1)}
            max={rawSourceDuration}
            value={trim.endFrame}
            onChange={(event) => onChange({ endFrame: Number(event.target.value) })}
          />
        </label>
        <div className="boxGrid">
          <NumberInput
            label="Start frame"
            value={trim.startFrame}
            onChange={(startFrame) => onChange({ startFrame })}
          />
          <NumberInput
            label="End frame"
            value={trim.endFrame}
            onChange={(endFrame) => onChange({ endFrame })}
          />
        </div>
      </div>
    </section>
  );
}

function FreezeEditor({
  fps,
  sourceDuration,
  freezes,
  selectedFreezeId,
  onAdd,
  onSelect,
  onChange,
  onDelete,
}: {
  fps: number;
  sourceDuration: number;
  freezes: FreezeFrameEdit[];
  selectedFreezeId: string;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<FreezeFrameEdit>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="recipeCard">
      <div className="panelTitle">
        <div>
          <h2>Freeze frames</h2>
          <p className="editorSubtle">Pause the raw clip to extend the final video.</p>
        </div>
        <button className="chipButton" onClick={onAdd}>
          Add freeze
        </button>
      </div>
      {freezes.length === 0 ? (
        <p className="editorSubtle">No freeze frames yet.</p>
      ) : (
        freezes.map((freeze) => (
          <div
            className={`sliderRow ${selectedFreezeId === freeze.id ? "selected" : ""}`}
            key={freeze.id}
            onFocus={() => onSelect(freeze.id)}
          >
            <div className="sliderRowTop">
              <button className="sliderLayerName" onClick={() => onSelect(freeze.id)}>
                Freeze at {framesToSeconds(freeze.atFrame, fps)}s
              </button>
              <button className="chipButton" onClick={() => onDelete(freeze.id)}>
                Remove
              </button>
            </div>
            <label>
              <span>Freeze time</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, sourceDuration - 1)}
                value={freeze.atFrame}
                onChange={(event) =>
                  onChange(freeze.id, { atFrame: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>Hold for {framesToSeconds(freeze.durationFrames, fps)}s</span>
              <input
                type="range"
                min={Math.round(fps / 2)}
                max={fps * 90}
                value={freeze.durationFrames}
                onChange={(event) =>
                  onChange(freeze.id, { durationFrames: Number(event.target.value) })
                }
              />
            </label>
            <div className="boxGrid">
              <NumberInput
                label="Frame"
                value={freeze.atFrame}
                onChange={(atFrame) => onChange(freeze.id, { atFrame })}
              />
              <NumberInput
                label="Hold frames"
                value={freeze.durationFrames}
                onChange={(durationFrames) => onChange(freeze.id, { durationFrames })}
              />
            </div>
          </div>
        ))
      )}
    </article>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function findLayer<T extends EditLayer>(
  composition: EditComposition,
  id: string,
  kind: T["kind"],
): T | undefined {
  const layer = composition.layers.find((candidate) => candidate.id === id);
  return layer?.kind === kind ? (layer as T) : undefined;
}

function friendlyLayerName(layer: EditLayer): string {
  if (layer.id === "opening-caption") return "Setup text";
  if (layer.id === "quote-caption") return "Quote";
  if (layer.id === "cta") return "Bottom ad";
  if (layer.kind === "tts") return `Voice: ${layer.name ?? layer.id}`;
  return layer.name ?? layer.id;
}

function sectionForLayer(layer: EditLayer): EditorSection {
  if (layer.kind === "video-source") return "setup";
  if (layer.id === "opening-caption") return "setup";
  if (layer.id === "quote-caption") return "quote";
  if (layer.id === "cta") return "bottom-ad";
  if (layer.kind === "text" || layer.kind === "callout") return "text";
  if (layer.kind === "image" || layer.kind === "speaker-badge") return "image";
  if (layer.kind === "shape") return "shape";
  if (layer.kind === "zoom") return "zoom";
  if (layer.kind === "tts") return "voiceover";
  if (layer.kind === "audio-file") return "sound-effects";
  return "text";
}

function clearTtsAudio(layer: TtsLayer): TtsLayer {
  const { src, artifactPath, ...draft } = layer;
  void src;
  void artifactPath;
  return draft;
}

function resizeBoxForLayer(
  startBox: Box,
  dx: number,
  dy: number,
  layer: EditLayer | undefined,
  canvas: EditComposition["canvas"],
): Box {
  if (layer?.kind !== "zoom") {
    return {
      ...startBox,
      width: Math.max(20, Math.round(startBox.width + dx)),
      height: Math.max(20, Math.round(startBox.height + dy)),
    };
  }
  const aspect = canvas.height / canvas.width;
  const width = Math.max(80, Math.round(startBox.width + dx));
  const height = Math.round(width * aspect);
  return {
    ...startBox,
    width: Math.min(width, canvas.width - startBox.x),
    height: Math.min(height, canvas.height - startBox.y),
  };
}

function lockZoomAspect(layer: ZoomLayer): ZoomLayer {
  const height = Math.round(layer.box.width * (1920 / 1080));
  return {
    ...layer,
    box: {
      ...layer.box,
      height,
    },
  };
}

function zoomPreviewTransform(
  layer: ZoomLayer,
  previewFrame: number,
  canvas: EditComposition["canvas"],
): CSSProperties {
  const duration = Math.max(1, layer.time.duration);
  const localFrame = Math.max(0, previewFrame - layer.time.start);
  const progress = Math.max(0, Math.min(1, localFrame / duration));
  const eased = easeProgress(progress, layer.easing);
  const startScale = canvas.width / layer.box.width;
  const scale = startScale + (1 - startScale) * eased;
  const translateX = (-(layer.box.x / canvas.width) * startScale * 100) * (1 - eased);
  const translateY = (-(layer.box.y / canvas.height) * startScale * 100) * (1 - eased);
  return {
    transformOrigin: "0 0",
    transform: `translate(${translateX}%, ${translateY}%) scale(${scale})`,
  };
}

function easeProgress(value: number, easing: ZoomLayer["easing"]): number {
  if (easing === "linear") return value;
  if (easing === "easeInOut") {
    return value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;
  }
  return 1 - (1 - value) * (1 - value);
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function audioPreviewUrl(src: string | undefined, jobId: string): string | null {
  if (!src) return null;
  if (src.startsWith("http") || src.startsWith("/")) return src;
  if (src.startsWith("sound-effects/")) return `/api/assets/${src}`;
  if (src.startsWith("assets/sound-effects/")) {
    return `/api/assets/${src.slice("assets/".length)}`;
  }
  return `/api/jobs/${jobId}/assets/${src}`;
}

function framesToSeconds(frames: number, fps = 30): number {
  return Math.round((frames / fps) * 10) / 10;
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

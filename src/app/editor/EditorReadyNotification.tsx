"use client";

import { useEffect } from "react";

export function EditorReadyNotification({
  enabled,
  jobId,
  game,
}: {
  enabled: boolean;
  jobId: string;
  game: string;
}) {
  useEffect(() => {
    if (!enabled) return;
    const storageKey = editorReadyNotificationKey(jobId);
    const hasLaunchIntent = readLaunchIntent(storageKey, game);
    if (!hasLaunchIntent) return;
    window.sessionStorage.removeItem(storageKey);

    if (!("Notification" in window) || Notification.permission !== "granted") {
      document.title = `Ready: ${game} editor`;
      return;
    }

    const notification = new Notification("Short is ready", {
      body: `${game} is open in the editor.`,
      tag: storageKey,
      silent: false,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, [enabled, game, jobId]);

  return null;
}

function readLaunchIntent(storageKey: string, game: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { game?: string; createdAt?: number };
    const isFresh =
      typeof parsed.createdAt === "number" && Date.now() - parsed.createdAt < 30 * 60 * 1000;
    return isFresh && (!parsed.game || parsed.game === game);
  } catch {
    return true;
  }
}

function editorReadyNotificationKey(jobId: string): string {
  return `short-factory:editor-ready:${jobId}`;
}

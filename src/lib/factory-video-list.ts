export type FactoryVideoListItem = {
  source?: {
    kind?: string;
    autoclipped?: boolean;
  };
};

export function isAutoclippedFactoryVideo(video: FactoryVideoListItem): boolean {
  return (
    video.source?.kind === "watchArchiveSelection" ||
    (video.source?.kind === "clip" && video.source.autoclipped === true)
  );
}

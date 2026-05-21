import { promises as fs } from "node:fs";
import path from "node:path";
import { jobDirectory } from "./job-store";

export type JobAsset = {
  name: string;
  relativePath: string;
  absolutePath: string;
  kind: "video" | "audio" | "image" | "json" | "other";
  sizeBytes: number;
};

export async function listJobAssets(jobId: string): Promise<JobAsset[]> {
  const root = jobDirectory(jobId);
  const assetsRoot = path.join(process.cwd(), "assets");
  const [jobAssets, soundEffects] = await Promise.all([
    walk(root, root).catch(() => []),
    walk(assetsRoot, path.join(assetsRoot, "sound-effects")).catch(() => []),
  ]);
  return [...jobAssets, ...soundEffects].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
}

async function walk(root: string, current: string): Promise<JobAsset[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) return walk(root, absolutePath);
      const stat = await fs.stat(absolutePath);
      const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
      return [
        {
          name: entry.name,
          relativePath,
          absolutePath,
          kind: assetKind(entry.name),
          sizeBytes: stat.size,
        },
      ];
    }),
  );
  return nested.flat();
}

function assetKind(fileName: string): JobAsset["kind"] {
  const ext = path.extname(fileName).toLowerCase();
  if ([".mp4", ".mov", ".webm"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if (ext === ".json") return "json";
  return "other";
}

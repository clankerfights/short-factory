import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { RenderInternals } from "@remotion/renderer";

const BINARY_DIR = path.join(process.cwd(), ".cache", "remotion-binaries");

export function configureRemotionLibraryPath(): void {
  const libraryDir = remotionExecutableDir();
  const current = process.env.DYLD_LIBRARY_PATH ?? "";
  const entries = current.split(":").filter(Boolean);
  if (!entries.includes(libraryDir)) {
    process.env.DYLD_LIBRARY_PATH = [libraryDir, ...entries].join(":");
  }
}

export function ffmpegSpawnEnv(ffmpegPath: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (ffmpegPath !== remotionExecutablePath("ffmpeg")) {
    const libraryDir = remotionExecutableDir();
    const entries = (env.DYLD_LIBRARY_PATH ?? "")
      .split(":")
      .filter((entry) => entry && entry !== libraryDir);
    if (entries.length > 0) {
      env.DYLD_LIBRARY_PATH = entries.join(":");
    } else {
      delete env.DYLD_LIBRARY_PATH;
    }
  }
  return env;
}

export function resolveFfmpegPath(): string {
  const configured = process.env.FFMPEG_PATH;
  if (configured && fs.existsSync(configured)) return configured;

  for (const candidate of [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return remotionExecutablePath("ffmpeg");
}

export function resolveFfprobePath(): string {
  const configured = process.env.FFPROBE_PATH;
  if (configured && fs.existsSync(configured)) return configured;

  const ffmpegSibling = siblingBinary(resolveFfmpegPath(), "ffprobe");
  if (ffmpegSibling) return ffmpegSibling;

  for (const candidate of [
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/usr/bin/ffprobe",
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return remotionExecutablePath("ffprobe");
}

export async function ensureRemotionBinariesDirectory(): Promise<string | null> {
  configureRemotionLibraryPath();

  await fsp.mkdir(BINARY_DIR, { recursive: true });
  await Promise.all([
    linkBinary(remotionExecutablePath("compositor"), path.join(BINARY_DIR, "remotion")),
    linkBinary(remotionExecutablePath("ffmpeg"), path.join(BINARY_DIR, "ffmpeg")),
    linkBinary(remotionExecutablePath("ffprobe"), path.join(BINARY_DIR, "ffprobe")),
    linkBundledCompositorLibraries(BINARY_DIR),
  ]);
  return BINARY_DIR;
}

function remotionExecutablePath(type: "compositor" | "ffmpeg" | "ffprobe"): string {
  return RenderInternals.getExecutablePath({
    type,
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
  });
}

function remotionExecutableDir(): string {
  return path.dirname(remotionExecutablePath("compositor"));
}

async function linkBundledCompositorLibraries(targetDir: string): Promise<void> {
  const sourceDir = remotionExecutableDir();
  const entries = await fsp.readdir(sourceDir);
  await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".dylib"))
      .map((entry) => linkBinary(path.join(sourceDir, entry), path.join(targetDir, entry))),
  );
}

function siblingBinary(binaryPath: string, name: string): string | null {
  const candidate = path.join(path.dirname(binaryPath), name);
  return fs.existsSync(candidate) ? candidate : null;
}

async function linkBinary(source: string, target: string): Promise<void> {
  try {
    const current = await fsp.readlink(target);
    if (current === source) return;
    await fsp.unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "EINVAL") {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code === "EINVAL") {
      await fsp.unlink(target);
    }
  }
  await fsp.symlink(source, target);
}

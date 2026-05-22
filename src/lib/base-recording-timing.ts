import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { getVideoMetadata, RenderInternals } from "@remotion/renderer";
import type { BaseRecordingTiming } from "./edit-model";
import { TIKTOK_CANVAS } from "./edit-model";
import { normalizeBaseRecordingTiming } from "./source-timeline";
import type { FactoryJob } from "./types";
import { DEFAULT_REPLAY_PLAYBACK_RATE } from "./capture-plan";

const PROBE_WIDTH = 36;
const PROBE_HEIGHT = 64;
const MEANINGFUL_STDDEV = 9.5;
const MEANINGFUL_DIFF = 12;
const STABLE_FRAMES = 5;

export async function ensureBaseRecordingTiming(
  job: FactoryJob,
  baseRecordingPath: string,
): Promise<BaseRecordingTiming> {
  const expectedDurationFrames = Math.max(
    1,
    Math.round(job.quoteJob.durationSeconds * TIKTOK_CANVAS.fps),
  );
  const playbackRate = playbackRateForJob(job);
  const existingTiming = job.artifacts.baseRecordingTiming;
  if (
    existingTiming &&
    !(existingTiming.method === "none" && existingTiming.confidence === "low")
  ) {
    const normalized = normalizeBaseRecordingTiming(
      { ...existingTiming, playbackRate: existingTiming.playbackRate ?? playbackRate },
      expectedDurationFrames,
      TIKTOK_CANVAS.fps,
    );
    job.artifacts.baseRecordingTiming = normalized;
    return normalized;
  }

  const timing = await detectBaseRecordingTiming({
    videoPath: baseRecordingPath,
    clipDurationFrames: expectedDurationFrames,
    playbackRate,
    fps: TIKTOK_CANVAS.fps,
  });
  job.artifacts.baseRecordingTiming = timing;
  return timing;
}

export async function detectBaseRecordingTiming(args: {
  videoPath: string;
  clipDurationFrames: number;
  playbackRate?: number;
  fps?: number;
}): Promise<BaseRecordingTiming> {
  const fps = args.fps ?? TIKTOK_CANVAS.fps;
  const playbackRate = replayPlaybackRate(args.playbackRate);
  const recordedFrames = await readRecordedDurationFrames(args.videoPath, fps);

  try {
    const detectedStart = await detectFirstMeaningfulFrame(args.videoPath, fps);
    const clipStartFrame = detectedStart.frame ?? 0;
    return normalizeBaseRecordingTiming(
      {
        fps,
        recordedDurationFrames: recordedFrames,
        clipStartFrame,
        clipEndFrame: Math.min(
          recordedFrames,
          clipStartFrame + Math.ceil(args.clipDurationFrames / playbackRate),
        ),
        clipDurationFrames: args.clipDurationFrames,
        playbackRate,
        method: detectedStart.frame === null ? "none" : "backfill-detection",
        confidence: detectedStart.confidence,
      },
      args.clipDurationFrames,
      fps,
    );
  } catch {
    return normalizeBaseRecordingTiming(
      {
        fps,
        recordedDurationFrames: recordedFrames,
        clipStartFrame: 0,
        clipEndFrame: Math.min(recordedFrames, Math.ceil(args.clipDurationFrames / playbackRate)),
        clipDurationFrames: args.clipDurationFrames,
        playbackRate,
        method: "none",
        confidence: "low",
      },
      args.clipDurationFrames,
      fps,
    );
  }
}

function playbackRateForJob(job: FactoryJob): number {
  return replayPlaybackRate(
    job.artifacts.baseRecordingTiming?.playbackRate ??
      job.quoteJob.capturePlan?.replay?.playbackRate ??
      DEFAULT_REPLAY_PLAYBACK_RATE,
  );
}

function replayPlaybackRate(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_REPLAY_PLAYBACK_RATE;
  return Math.max(0.1, Math.min(16, value));
}

async function readRecordedDurationFrames(videoPath: string, fps: number): Promise<number> {
  const metadata = await getVideoMetadata(videoPath, { logLevel: "error" });
  return Math.max(1, Math.round((metadata.durationInSeconds ?? 0) * fps));
}

async function detectFirstMeaningfulFrame(
  videoPath: string,
  fps: number,
): Promise<{ frame: number | null; confidence: BaseRecordingTiming["confidence"] }> {
  const probeDir = await fs.mkdtemp(path.join(os.tmpdir(), "short-factory-probe-"));
  try {
    await extractProbeFrames(videoPath, fps, probeDir);
    const entries = (await fs.readdir(probeDir))
      .filter((entry) => entry.endsWith(".png"))
      .sort();
    let firstFrame: Uint8Array | null = null;
    let firstStats: FrameStats | null = null;
    let candidateFrame: number | null = null;
    let consecutive = 0;

    for (let frameIndex = 0; frameIndex < entries.length; frameIndex += 1) {
      const frame = pngToGrayscale(await fs.readFile(path.join(probeDir, entries[frameIndex])));
      const stats = frameStats(frame);

      if (!firstFrame || !firstStats) {
        firstFrame = frame;
        firstStats = stats;
        if (stats.stddev >= MEANINGFUL_STDDEV) {
          return { frame: 0, confidence: "medium" };
        }
        continue;
      }

      const meaningful = isMeaningfulFrame(frame, stats, firstFrame, firstStats);
      if (meaningful) {
        candidateFrame ??= frameIndex;
        consecutive += 1;
        if (consecutive >= STABLE_FRAMES) {
          return {
            frame: Math.max(0, candidateFrame),
            confidence: candidateFrame > 0 ? "high" : "medium",
          };
        }
      } else {
        candidateFrame = null;
        consecutive = 0;
      }
    }

    return { frame: null, confidence: "low" };
  } finally {
    await fs.rm(probeDir, { recursive: true, force: true });
  }
}

async function extractProbeFrames(
  videoPath: string,
  fps: number,
  outputDir: string,
): Promise<void> {
  const ffmpegPath = RenderInternals.getExecutablePath({
    type: "ffmpeg",
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
  });
  const args = [
    "-v",
    "error",
    "-i",
    videoPath,
    "-vf",
    `scale=w=${PROBE_WIDTH}:h=${PROBE_HEIGHT}`,
    "-r",
    String(fps),
    path.join(outputDir, "frame-%05d.png"),
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || `ffmpeg exited ${code}`));
        return;
      }
      resolve();
    });
  });
}

function isMeaningfulFrame(
  frame: Uint8Array,
  stats: FrameStats,
  firstFrame: Uint8Array,
  firstStats: FrameStats,
): boolean {
  if (stats.stddev < MEANINGFUL_STDDEV) return false;
  return (
    Math.abs(stats.mean - firstStats.mean) >= 2 ||
    meanAbsoluteDifference(frame, firstFrame) >= MEANINGFUL_DIFF
  );
}

type FrameStats = {
  mean: number;
  stddev: number;
};

function frameStats(frame: Uint8Array): FrameStats {
  let sum = 0;
  for (const value of frame) sum += value;
  const mean = sum / frame.length;
  let variance = 0;
  for (const value of frame) variance += (value - mean) ** 2;
  return { mean, stddev: Math.sqrt(variance / frame.length) };
}

function meanAbsoluteDifference(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += Math.abs(a[index] - b[index]);
  }
  return total / length;
}

function pngToGrayscale(png: Buffer): Uint8Array {
  const decoded = decodePng(png);
  const output = new Uint8Array(decoded.width * decoded.height);
  const channels = decoded.channels;
  for (let pixel = 0; pixel < output.length; pixel += 1) {
    const offset = pixel * channels;
    if (channels === 1) {
      output[pixel] = decoded.pixels[offset];
    } else {
      output[pixel] = Math.round(
        (decoded.pixels[offset] + decoded.pixels[offset + 1] + decoded.pixels[offset + 2]) / 3,
      );
    }
  }
  return output;
}

function decodePng(png: Buffer): {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
} {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  let bitDepth = 8;
  let idat = Buffer.alloc(0);
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idat = Buffer.concat([idat, data]);
    offset += 12 + length;
  }

  if (bitDepth !== 8 || ![0, 2, 6].includes(colorType)) {
    throw new Error("Unsupported PNG probe frame.");
  }

  const channels = colorType === 0 ? 1 : colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(idat);
  const pixels = new Uint8Array(stride * height);
  let sourceOffset = 0;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = rowIndex * stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset + column];
      const left = column >= channels ? pixels[rowStart + column - channels] : 0;
      const up = rowIndex > 0 ? pixels[rowStart + column - stride] : 0;
      const upLeft =
        rowIndex > 0 && column >= channels
          ? pixels[rowStart + column - stride - channels]
          : 0;
      pixels[rowStart + column] = unfilterByte(filter, raw, left, up, upLeft);
    }
    sourceOffset += stride;
  }
  return { width, height, channels, pixels };
}

function unfilterByte(
  filter: number,
  raw: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

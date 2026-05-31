import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { ffmpegSpawnEnv, resolveFfmpegPath } from "./remotion-binaries";

export type VideoProbeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DecodedPng = {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
};

export type DecodedVideoFrame = {
  frame: number;
  decoded: DecodedPng;
};

export async function extractCroppedVideoFrames(args: {
  videoPath: string;
  fps: number;
  startFrame: number;
  endFrame: number;
  rect: VideoProbeRect;
}): Promise<DecodedVideoFrame[]> {
  const startFrame = Math.max(0, Math.round(args.startFrame));
  const endFrame = Math.max(startFrame, Math.round(args.endFrame));
  const rect = normalizeProbeRect(args.rect);
  if (!rect) return [];

  const probeDir = await fs.mkdtemp(path.join(os.tmpdir(), "short-factory-frame-probe-"));
  try {
    const durationSeconds = (endFrame - startFrame + 1) / args.fps;
    await runFfmpeg([
      "-v",
      "error",
      "-i",
      args.videoPath,
      "-ss",
      String(startFrame / args.fps),
      "-t",
      String(durationSeconds),
      "-vf",
      `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y}`,
      "-r",
      String(args.fps),
      path.join(probeDir, "frame-%05d.png"),
    ]);
    const entries = (await fs.readdir(probeDir))
      .filter((entry) => entry.endsWith(".png"))
      .sort();
    return Promise.all(
      entries.map(async (entry, index) => ({
        frame: startFrame + index,
        decoded: decodePng(await fs.readFile(path.join(probeDir, entry))),
      })),
    );
  } finally {
    await fs.rm(probeDir, { recursive: true, force: true });
  }
}

export function meanAbsolutePixelDifference(a: DecodedPng, b: DecodedPng): number {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  if (width <= 0 || height <= 0) return Number.POSITIVE_INFINITY;

  let total = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const aOffset = (y * a.width + x) * a.channels;
      const bOffset = (y * b.width + x) * b.channels;
      const channels = Math.min(3, a.channels, b.channels);
      for (let channel = 0; channel < channels; channel += 1) {
        total += Math.abs(a.pixels[aOffset + channel] - b.pixels[bOffset + channel]);
        count += 1;
      }
    }
  }

  return count > 0 ? total / count : Number.POSITIVE_INFINITY;
}

export function decodePng(png: Buffer): DecodedPng {
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

async function runFfmpeg(args: string[]): Promise<Buffer> {
  const ffmpegPath = resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      env: ffmpegSpawnEnv(ffmpegPath),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8") || `ffmpeg exited ${code}`));
    });
  });
}

function normalizeProbeRect(rect: VideoProbeRect): VideoProbeRect | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (width < 2 || height < 2) return null;
  return { x, y, width, height };
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

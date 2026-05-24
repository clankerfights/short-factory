import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { deflateSync, inflateSync } from "node:zlib";
import { RenderInternals } from "@remotion/renderer";
import { renderRawClipVideo } from "../src/lib/render-recipe";
import type { FactoryJob } from "../src/lib/types";

const SYNTHETIC_WIDTH = 54;
const SYNTHETIC_HEIGHT = 96;
const SYNTHETIC_FPS = 30;

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "short-factory-source-timeline-"));
  try {
    await assertOneToOnePrerollRemoval(tmp);
    await assertTwoXSourceTimeline(tmp);
    console.log("Source timeline render smoke passed.");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function assertOneToOnePrerollRemoval(tmp: string): Promise<void> {
  const baseRecordingPath = path.join(tmp, "base-recording-1x.mp4");
  const outputPath = path.join(tmp, "raw-1x.mp4");
  await createSyntheticRecording(baseRecordingPath, [
    { seconds: 1, rgb: [0, 0, 255] },
  ]);

  const job = syntheticJob(tmp, baseRecordingPath, {
    durationSeconds: 1,
    playbackRate: 1,
  });
  await renderRawClipVideo({ job, baseRecordingPath, outputPath });

  assertMostlyColor(await frameRgb(outputPath, 0), "blue");
  assert.equal(job.artifacts.baseRecordingTiming?.clipStartFrame, 30);
}

async function assertTwoXSourceTimeline(tmp: string): Promise<void> {
  const baseRecordingPath = path.join(tmp, "base-recording-2x.mp4");
  const outputPath = path.join(tmp, "raw-2x.mp4");
  await createSyntheticRecording(baseRecordingPath, [
    { seconds: 0.5, rgb: [0, 0, 255] },
    { seconds: 0.5, rgb: [0, 255, 0] },
  ]);

  const job = syntheticJob(tmp, baseRecordingPath, {
    durationSeconds: 2,
    playbackRate: 2,
  });
  await renderRawClipVideo({ job, baseRecordingPath, outputPath });

  assertMostlyColor(await frameRgb(outputPath, 20 / SYNTHETIC_FPS), "blue");
  assertMostlyColor(await frameRgb(outputPath, 50 / SYNTHETIC_FPS), "green");
  assert.equal(job.artifacts.baseRecordingTiming?.playbackRate, 2);
}

async function createSyntheticRecording(
  outputPath: string,
  contentSegments: Array<{ seconds: number; rgb: [number, number, number] }>,
): Promise<void> {
  const dir = path.dirname(outputPath);
  const segments = [
    { seconds: 1, rgb: [255, 255, 255] as [number, number, number] },
    ...contentSegments,
  ];
  const imagePaths = await Promise.all(
    segments.map(async (segment, index) => {
      const imagePath = path.join(dir, `segment-${index}.png`);
      await fs.writeFile(
        imagePath,
        solidPng(SYNTHETIC_WIDTH, SYNTHETIC_HEIGHT, segment.rgb),
      );
      return imagePath;
    }),
  );
  const inputs = imagePaths.flatMap((imagePath, index) => [
    "-loop",
    "1",
    "-t",
    String(segments[index]?.seconds ?? 1),
    "-r",
    String(SYNTHETIC_FPS),
    "-i",
    imagePath,
  ]);
  await runFfmpeg([
    "-y",
    ...inputs,
    "-filter_complex",
    `${segments.map((_, index) => `[${index}:v]`).join("")}concat=n=${segments.length}:v=1:a=0,format=yuv420p`,
    "-r",
    String(SYNTHETIC_FPS),
    outputPath,
  ]);
}

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 3;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function frameRgb(videoPath: string, seconds: number): Promise<[number, number, number]> {
  const png = await runFfmpeg([
    "-v",
    "error",
    "-i",
    videoPath,
    "-ss",
    seconds.toFixed(4),
    "-frames:v",
    "1",
    "-vf",
    "scale=1:1",
    "-c:v",
    "png",
    "-f",
    "image2pipe",
    "-",
  ]);
  return firstPixelFromPng(png);
}

function assertMostlyColor(
  rgb: [number, number, number],
  color: "blue" | "green",
): void {
  const [red, green, blue] = rgb;
  if (color === "blue") {
    assert.ok(
      blue > red + 40 && blue > green + 40,
      `expected blue frame, got rgb(${red}, ${green}, ${blue})`,
    );
    return;
  }
  assert.ok(
    green > red + 40 && green > blue + 40,
    `expected green frame, got rgb(${red}, ${green}, ${blue})`,
  );
}

function firstPixelFromPng(png: Buffer): [number, number, number] {
  let offset = 8;
  let colorType = 2;
  let idat = Buffer.alloc(0);
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") colorType = data[9];
    if (type === "IDAT") idat = Buffer.concat([idat, data]);
    offset += 12 + length;
  }
  const inflated = inflateSync(idat);
  const channels = colorType === 6 ? 4 : 3;
  const pixelOffset = 1;
  if (inflated[0] !== 0 || inflated.length < pixelOffset + channels) {
    throw new Error("Unexpected PNG filter in source timeline smoke test.");
  }
  return [inflated[pixelOffset], inflated[pixelOffset + 1], inflated[pixelOffset + 2]];
}

async function runFfmpeg(args: string[], inputFrames?: Buffer[]): Promise<Buffer> {
  const ffmpegPath = RenderInternals.getExecutablePath({
    type: "ffmpeg",
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
  });
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: [inputFrames ? "pipe" : "ignore", "pipe", "pipe"],
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
    if (inputFrames) {
      for (const frame of inputFrames) child.stdin?.write(frame);
      child.stdin?.end();
    }
  });
}

function syntheticJob(
  jobDir: string,
  baseRecordingPath: string,
  options: {
    durationSeconds: number;
    playbackRate: number;
  },
): FactoryJob {
  const clipDurationFrames = Math.max(
    1,
    Math.round(options.durationSeconds * SYNTHETIC_FPS),
  );
  const recordedClipFrames = Math.ceil(clipDurationFrames / options.playbackRate);
  const recordedDurationFrames = SYNTHETIC_FPS + recordedClipFrames;
  const trimEndMs = Math.round(options.durationSeconds * 1000);

  return {
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: new Date(0).toISOString(),
    status: {
      ingest: "complete",
      recipe: "complete",
      recording: "complete",
      render: "pending",
    },
    quoteJob: {
      clipId: "source-timeline-smoke",
      clipUrl: "https://clankerfights.ai/clip/source-timeline-smoke",
      playbackUrl: "https://clankerfights.ai/?clip=source-timeline-smoke",
      game: "smoke",
      speaker: "Narrator",
      trimStartMs: 0,
      trimEndMs,
      durationSeconds: options.durationSeconds,
      highlightedChatIds: [],
      highlightedMessages: [],
      players: [],
      rawMaterials: {
        clipId: "source-timeline-smoke",
        sourceUrl: "https://clankerfights.ai/clip/source-timeline-smoke",
        playbackUrl: "https://clankerfights.ai/?clip=source-timeline-smoke",
        game: "smoke",
        trimWindowMs: { start: 0, end: 1000 },
        durationSeconds: options.durationSeconds,
        players: [],
        highlightedChatIds: [],
        highlightedMessages: [],
        capturePlan: {
          id: "phone-fit-replay-v1",
          outputSize: { width: 1080, height: 1920 },
          viewport: { width: 540, height: 960 },
          sourceLayout: {
            width: 540,
            heightMode: "viewport",
            scaleToViewportWidth: true,
          },
          replay: {
            autoplay: true,
            playbackRate: options.playbackRate,
            waitForReadySignal: true,
            readinessGlobal: "__CLIP_FACTORY_READY__",
            preferredPlaySelector: '[data-factory-play="true"]',
          },
          chrome: {
            hideOverflow: true,
            hidePointerCursor: true,
            pageBackground: "#05070a",
          },
        },
        recommendedFactoryMode: {
          queryParam: "factory",
          capabilities: [],
        },
      },
      capturePlan: {
        id: "phone-fit-replay-v1",
        outputSize: { width: 1080, height: 1920 },
        viewport: { width: 540, height: 960 },
        sourceLayout: {
          width: 540,
          heightMode: "viewport",
          scaleToViewportWidth: true,
        },
        replay: {
          autoplay: true,
          playbackRate: options.playbackRate,
          waitForReadySignal: true,
          readinessGlobal: "__CLIP_FACTORY_READY__",
          preferredPlaySelector: '[data-factory-play="true"]',
        },
        chrome: {
          hideOverflow: true,
          hidePointerCursor: true,
          pageBackground: "#05070a",
        },
      },
    },
    editRecipe: {
      sourceClipId: "source-timeline-smoke",
      variants: [
        {
          variantId: "v1",
          template: "narrator_quote_punchline",
          setupLine: "Synthetic",
          openingCaption: "Synthetic",
          speaker: "Narrator",
          speakerExpression: "neutral",
          quoteText: "Synthetic",
          punchlinePhrase: "Synthetic",
          highlightPhrases: [],
          captionStyle: "deadpan",
          cta: "clankerfights.ai",
        },
      ],
    },
    artifacts: {
      baseRecordingPath,
      baseRecordingTiming: {
        fps: 30,
        recordedDurationFrames,
        clipStartFrame: 30,
        clipEndFrame: 30 + recordedClipFrames,
        clipDurationFrames,
        playbackRate: options.playbackRate,
        method: "backfill-detection",
        confidence: "high",
      },
      rawVideoPath: path.join(jobDir, "raw.mp4"),
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

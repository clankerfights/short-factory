import { promises as fs } from "node:fs";
import path from "node:path";
import { readFactoryJob, saveFactoryJob } from "../src/lib/job-store";
import { recordClipViewport } from "../src/lib/record-clip";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobId = requireArg(args.jobId ?? args.job, "--job-id");
  const job = await readFactoryJob(jobId);
  const outputPath =
    args.output ??
    path.join(process.cwd(), "data", "jobs", job.id, "base-recording.webm");
  const durationSeconds = Number(args.duration ?? job.quoteJob.durationSeconds);

  const result = await recordClipViewport({
    playbackUrl: job.quoteJob.playbackUrl,
    outputPath,
    durationSeconds,
    capturePlan: job.quoteJob.capturePlan,
  });

  job.status.recording = "complete";
  job.artifacts.baseRecordingPath = result.outputPath;
  job.artifacts.baseRecordingTiming = result.baseRecordingTiming;
  if (result.factoryPacket) {
    const packetPath = path.join(
      process.cwd(),
      "data",
      "jobs",
      job.id,
      "factory-packet.json",
    );
    await fs.writeFile(packetPath, `${JSON.stringify(result.factoryPacket, null, 2)}\n`);
    job.artifacts.factoryPacketPath = packetPath;
  }
  delete job.artifacts.error;
  await saveFactoryJob(job);
  console.log(result.outputPath);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, char: string) =>
      char.toUpperCase(),
    );
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

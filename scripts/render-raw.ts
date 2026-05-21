import path from "node:path";
import { jobDirectory, readFactoryJob, saveFactoryJob } from "../src/lib/job-store";
import { renderRawClipVideo } from "../src/lib/render-recipe";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobId = requireArg(args.jobId ?? args.job, "--job-id");
  const job = await readFactoryJob(jobId);
  const baseRecordingPath = requireArg(
    args.base ?? job.artifacts.baseRecordingPath,
    "--base",
  );
  const outputPath = args.output ?? path.join(jobDirectory(job.id), "raw.mp4");

  const rawVideoPath = await renderRawClipVideo({
    job,
    baseRecordingPath,
    outputPath,
  });

  job.artifacts.rawVideoPath = rawVideoPath;
  delete job.artifacts.error;
  await saveFactoryJob(job);
  console.log(rawVideoPath);
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

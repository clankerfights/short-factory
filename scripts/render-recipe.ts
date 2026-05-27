import path from "node:path";
import { readFactoryJob, saveFactoryJob } from "../src/lib/job-store";
import { renderRecipeVariant } from "../src/lib/render-recipe";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobId = requireArg(args.jobId ?? args.job, "--job-id");
  const job = await readFactoryJob(jobId);
  const variantId = args.variant ?? "v1";
  const baseRecordingPath = requireArg(
    args.base ?? job.artifacts.baseRecordingPath,
    "--base",
  );
  const outputPath =
    args.output ??
    path.join(process.cwd(), "data", "jobs", job.id, `${variantId}.mp4`);

  const renderedPath = await renderRecipeVariant({
    job,
    variantId,
    baseRecordingPath,
    outputPath,
  });

  job.status.render = "complete";
  job.artifacts.renderedVideoPath = renderedPath;
  job.artifacts.renderedVariants = {
    ...(job.artifacts.renderedVariants ?? {}),
    [variantId]: renderedPath,
  };
  delete job.artifacts.error;
  await saveFactoryJob(job);
  console.log(renderedPath);
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

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FactoryJob } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "jobs");

export async function createFactoryJob(args: {
  quoteJob: FactoryJob["quoteJob"];
  editRecipe: FactoryJob["editRecipe"];
}): Promise<FactoryJob> {
  const job: FactoryJob = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: {
      ingest: "complete",
      recipe: "complete",
      recording: "pending",
      render: "pending",
    },
    quoteJob: args.quoteJob,
    editRecipe: args.editRecipe,
    artifacts: {},
  };

  await saveFactoryJob(job);
  return job;
}

export async function readFactoryJob(jobId: string): Promise<FactoryJob> {
  assertSafeJobId(jobId);
  const raw = await fs.readFile(jobPath(jobId), "utf8");
  return JSON.parse(raw) as FactoryJob;
}

export async function listFactoryJobs(limit = 12): Promise<FactoryJob[]> {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const job = await readFactoryJob(entry.name);
          const stat = await fs.stat(jobPath(entry.name));
          return { job, updatedAtMs: stat.mtimeMs };
        } catch {
          return null;
        }
      }),
  );

  return jobs
    .filter((entry): entry is { job: FactoryJob; updatedAtMs: number } => Boolean(entry))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, limit)
    .map((entry) => entry.job);
}

export async function saveFactoryJob(job: FactoryJob): Promise<void> {
  assertSafeJobId(job.id);
  const dir = path.dirname(jobPath(job.id));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`, "utf8");
}

export function jobDirectory(jobId: string): string {
  assertSafeJobId(jobId);
  return path.join(DATA_DIR, jobId);
}

export function jobJsonPath(jobId: string): string {
  assertSafeJobId(jobId);
  return jobPath(jobId);
}

function jobPath(jobId: string): string {
  return path.join(DATA_DIR, jobId, "job.json");
}

function assertSafeJobId(jobId: string): void {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) {
    throw new Error("Invalid job id.");
  }
}

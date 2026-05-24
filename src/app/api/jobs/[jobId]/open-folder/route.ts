import path from "node:path";
import { NextResponse } from "next/server";
import { jobDirectory, readFactoryJob } from "../../../../../lib/job-store";
import { openContainingFolder } from "../../../../../lib/open-folder";

export const runtime = "nodejs";

type OpenFolderRequest = {
  artifact?: "rendered" | "raw" | "base";
};

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const body = (await optionalJson(request)) as OpenFolderRequest;
    const job = await readFactoryJob(jobId);
    const artifactPath = artifactPathForJob(job.artifacts, body.artifact ?? "rendered");
    if (!artifactPath) {
      throw new Error("That video has not been created yet.");
    }

    const jobDir = path.resolve(jobDirectory(job.id));
    const resolvedArtifact = path.resolve(artifactPath);
    if (resolvedArtifact !== jobDir && !resolvedArtifact.startsWith(`${jobDir}${path.sep}`)) {
      throw new Error("Refusing to open a path outside this job folder.");
    }

    const folder = await openContainingFolder(resolvedArtifact);
    return NextResponse.json({ ok: true, folder });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not open folder." },
      { status: 500 },
    );
  }
}

function artifactPathForJob(
  artifacts: {
    baseRecordingPath?: string;
    rawVideoPath?: string;
    renderedVideoPath?: string;
  },
  artifact: NonNullable<OpenFolderRequest["artifact"]>,
): string | undefined {
  if (artifact === "raw") return artifacts.rawVideoPath;
  if (artifact === "base") return artifacts.baseRecordingPath;
  return artifacts.renderedVideoPath;
}

async function optionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TemplateRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "templates");

export async function listTemplates(): Promise<TemplateRecord[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const templates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => readTemplate(entry.name).catch(() => null)),
  );
  return templates
    .filter((template): template is TemplateRecord => template !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createTemplate(
  input: Omit<TemplateRecord, "id" | "createdAt" | "updatedAt" | "version"> &
    Partial<Pick<TemplateRecord, "version">>,
): Promise<TemplateRecord> {
  const now = new Date().toISOString();
  const template: TemplateRecord = {
    id: randomUUID(),
    version: input.version ?? 1,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  await saveTemplate(template);
  return template;
}

export async function readTemplate(templateId: string): Promise<TemplateRecord> {
  assertSafeTemplateId(templateId);
  const raw = await fs.readFile(templatePath(templateId), "utf8");
  return JSON.parse(raw) as TemplateRecord;
}

export async function updateTemplate(
  templateId: string,
  patch: Partial<Omit<TemplateRecord, "id" | "createdAt" | "updatedAt">>,
): Promise<TemplateRecord> {
  const template = await readTemplate(templateId);
  const next: TemplateRecord = {
    ...template,
    ...patch,
    id: template.id,
    createdAt: template.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await saveTemplate(next);
  return next;
}

export async function saveTemplate(template: TemplateRecord): Promise<void> {
  assertSafeTemplateId(template.id);
  await fs.mkdir(templateDirectory(template.id), { recursive: true });
  await fs.writeFile(
    templatePath(template.id),
    `${JSON.stringify(template, null, 2)}\n`,
    "utf8",
  );
}

export function templateDirectory(templateId: string): string {
  assertSafeTemplateId(templateId);
  return path.join(DATA_DIR, templateId);
}

function templatePath(templateId: string): string {
  return path.join(templateDirectory(templateId), "template.json");
}

function assertSafeTemplateId(templateId: string): void {
  if (!/^[a-f0-9-]{36}$/i.test(templateId)) {
    throw new Error("Invalid template id.");
  }
}

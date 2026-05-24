import type { EditComposition } from "./edit-model";
import {
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_TEMPLATE_VERSION,
  applyDefaultTemplate,
  isCurrentDefaultTemplate,
} from "./default-template";
import type { EditRecipeVariant, FactoryJob } from "./types";

export type BuiltInTemplateSummary = {
  id: string;
  name: string;
  description: string;
  version: number;
  tags: string[];
};

type BuiltInTemplate = BuiltInTemplateSummary & {
  apply: (job: FactoryJob, variant: EditRecipeVariant) => Promise<EditComposition>;
  isCurrent: (composition: EditComposition | undefined) => boolean;
};

const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: DEFAULT_TEMPLATE_ID,
    name: DEFAULT_TEMPLATE_NAME,
    description:
      "White hook intro, generated TTS, clustered highlight freezes, bot faces, and a clankerfights.ai outro.",
    version: DEFAULT_TEMPLATE_VERSION,
    tags: ["automatic", "tts", "highlight-freezes"],
    apply: applyDefaultTemplate,
    isCurrent: isCurrentDefaultTemplate,
  },
];

export const DEFAULT_AUTOMATIC_TEMPLATE_ID = DEFAULT_TEMPLATE_ID;

export function listBuiltInTemplates(): BuiltInTemplateSummary[] {
  return BUILT_IN_TEMPLATES.map(({ apply: _apply, isCurrent: _isCurrent, ...template }) => template);
}

export function isBuiltInTemplateId(templateId: string | undefined): boolean {
  return Boolean(templateId && BUILT_IN_TEMPLATES.some((template) => template.id === templateId));
}

export function resolveAutomaticTemplateId(templateId: string | undefined): string {
  return templateId && isBuiltInTemplateId(templateId)
    ? templateId
    : DEFAULT_AUTOMATIC_TEMPLATE_ID;
}

export async function applyAutomaticTemplate(
  job: FactoryJob,
  variant: EditRecipeVariant,
  templateId = DEFAULT_AUTOMATIC_TEMPLATE_ID,
): Promise<EditComposition> {
  const template = builtInTemplate(templateId);
  if (!template) throw new Error(`Unknown automatic template: ${templateId}`);
  return template.apply(job, variant);
}

export function isCurrentAutomaticTemplate(
  composition: EditComposition | undefined,
  templateId = composition?.templateId,
): boolean {
  const template = builtInTemplate(templateId);
  return template ? template.isCurrent(composition) : false;
}

function builtInTemplate(templateId: string | undefined): BuiltInTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.id === templateId);
}

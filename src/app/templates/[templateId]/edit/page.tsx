import { notFound } from "next/navigation";
import { readTemplate } from "../../../../lib/template-store";
import { CompositionWorkspace } from "../../../editor/CompositionWorkspace";

export const runtime = "nodejs";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  try {
    const { templateId } = await params;
    const template = await readTemplate(templateId);
    return (
      <CompositionWorkspace
        title={template.name}
        subtitle={`Template v${template.version} / ${template.tags.join(", ") || "untagged"}`}
        initialComposition={template.composition}
        target={{
          kind: "template",
          templateId: template.id,
          templateUrl: `/api/templates/${template.id}`,
          initialName: template.name,
          initialDescription: template.description,
          initialTags: template.tags,
        }}
      />
    );
  } catch {
    notFound();
  }
}

import { connection } from "next/server";
import { Suspense } from "react";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import { describeRange } from "@/lib/breakpoints";
import { DEFAULT_TEMPLATE } from "@/lib/model/defaults";
import { listScaffoldTemplates } from "@/lib/storage/scaffoldTemplates";
import { NewProjectForm } from "./NewProjectForm";

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="New project"
        description="The folders and breakpoints come from the template you choose; you can change them later."
      />
      <Suspense fallback={null}>
        <EditGate>
          <Form />
        </EditGate>
      </Suspense>
    </>
  );
}

async function Form() {
  await connection();
  const templates = (await listScaffoldTemplates()).map((t) => ({
    id: t.id,
    name: t.name,
    breakpoints: t.breakpoints.breakpoints.map((b) => `${b.name} ${describeRange(b)}`).join(" · "),
  }));
  return <NewProjectForm templates={templates} defaultTemplateId={DEFAULT_TEMPLATE.id} />;
}

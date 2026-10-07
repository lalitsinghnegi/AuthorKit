import { PageHeader } from "@/components/PageHeader";
import { NewProjectForm } from "./NewProjectForm";

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="New project"
        description="Breakpoints and a starter folder scaffold are added with defaults; you can change them later."
      />
      <NewProjectForm />
    </>
  );
}

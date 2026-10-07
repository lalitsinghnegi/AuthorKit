"use client";

import { deleteProjectAction } from "@/app/projects/actions";
import { PanelButton } from "./PanelSection";

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteProjectAction.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <PanelButton type="submit" variant="danger">
        Delete project
      </PanelButton>
    </form>
  );
}

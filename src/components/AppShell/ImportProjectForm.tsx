"use client";

import { useActionState } from "react";
import { importProjectAction, type ImportState } from "@/app/projects/actions";
import { PanelButton, PanelNote } from "./PanelSection";
import styles from "./AppShell.module.css";

export function ImportProjectForm() {
  const [state, formAction, pending] = useActionState(importProjectAction, {} as ImportState);
  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <label className={styles.visuallyHidden} htmlFor="import-file">
        Project export file
      </label>
      <input
        id="import-file"
        type="file"
        name="file"
        accept="application/json,.json"
        className={styles.fileInput}
        required
      />
      <PanelButton type="submit" variant="secondary" disabled={pending}>
        {pending ? "Importing…" : "Import project.json"}
      </PanelButton>
      {state.error && (
        <div role="alert">
          <PanelNote>{state.error}</PanelNote>
        </div>
      )}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { importScaffoldTemplateAction, type ImportState } from "@/app/(app)/templates/actions";
import { PanelButton, PanelNote } from "./PanelSection";
import styles from "./AppShell.module.css";

export function ImportScaffoldForm() {
  const [state, formAction, pending] = useActionState(
    importScaffoldTemplateAction,
    {} as ImportState,
  );
  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <label className={styles.visuallyHidden} htmlFor="import-scaffold-file">
        Scaffold preset file
      </label>
      <input
        id="import-scaffold-file"
        type="file"
        name="file"
        accept="application/json,.json"
        className={styles.fileInput}
        required
      />
      <PanelButton type="submit" variant="secondary" disabled={pending}>
        {pending ? "Importing…" : "Import preset"}
      </PanelButton>
      {state.error && (
        <div role="alert">
          <PanelNote>{state.error}</PanelNote>
        </div>
      )}
    </form>
  );
}

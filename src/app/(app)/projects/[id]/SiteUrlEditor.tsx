"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ui from "@/components/ui/ui.module.css";
import { saveSiteUrlAction } from "./actions";

type Props = { projectId: string; initial?: string };

/** The published site URL, editable in place on the project overview. */
export function SiteUrlEditor({ projectId, initial = "" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const dirty = value.trim() !== initial;

  const save = () =>
    start(async () => {
      const result = await saveSiteUrlAction(projectId, value);
      if (result.ok) {
        setValue(result.siteUrl ?? "");
        setStatus({ ok: true, message: result.siteUrl ? "Site URL saved." : "Site URL removed." });
        router.refresh();
      } else setStatus({ ok: false, message: result.error });
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ display: "grid", gap: 6 }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          id="site-url"
          type="url"
          inputMode="url"
          className={ui.input}
          style={{ flex: "1 1 260px", minWidth: 0 }}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus(null);
          }}
          maxLength={2048}
          placeholder="https://www.example.com"
          autoComplete="url"
          spellCheck={false}
          aria-describedby="site-url-hint"
          aria-invalid={status && !status.ok ? true : undefined}
        />
        <button type="submit" className={ui.button} disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {initial && (
          <a href={initial} target="_blank" rel="noopener noreferrer">
            Open site
          </a>
        )}
      </div>
      <span id="site-url-hint" className={ui.hint}>
        The published site, used as the reference for the real page structure. Leave empty to remove
        it.
      </span>
      {status && (
        <p
          role={status.ok ? "status" : "alert"}
          className={status.ok ? undefined : ui.error}
          style={status.ok ? { margin: 0, color: "#2e7d32" } : undefined}
        >
          {status.message}
        </p>
      )}
    </form>
  );
}

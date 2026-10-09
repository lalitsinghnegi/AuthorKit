"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import { MAX_SITE_PAGES } from "@/lib/model";
import { readSiteAction, saveSitePagesAction } from "./actions";

type Props = { projectId: string; siteUrl: string; pages: string[] };
type Status = { ok: boolean; message: string };

/** "Read site" in the left panel, and the list of extra pages to read. */
export function SiteActions({ projectId, siteUrl, pages }: Props) {
  const router = useRouter();
  const initial = pages.join("\n");
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<Status | null>(null);
  const [pagesStatus, setPagesStatus] = useState<Status | null>(null);
  const [reading, startRead] = useTransition();
  const [saving, startSave] = useTransition();
  const dirty = text.trim() !== initial;

  const read = () =>
    startRead(async () => {
      const result = await readSiteAction(projectId);
      if (!result.ok) return setStatus({ ok: false, message: result.error });
      const ok = result.data.pages.filter((p) => p.ok).length;
      setStatus({
        ok: true,
        message: `Read ${ok} of ${result.data.pages.length} page${result.data.pages.length === 1 ? "" : "s"}.`,
      });
      router.refresh();
    });

  const savePages = () =>
    startSave(async () => {
      const result = await saveSitePagesAction(projectId, text);
      if (!result.ok) return setPagesStatus({ ok: false, message: result.error });
      setText(result.pages.join("\n"));
      setPagesStatus({ ok: true, message: "Pages saved. Read the site again to include them." });
      router.refresh();
    });

  return (
    <>
      <PanelActions>
        <PanelSection title="Site">
          <PanelButton onClick={read} disabled={reading || dirty}>
            {reading ? "Reading site…" : "Read site"}
          </PanelButton>
          <p className={panel.panelHint}>
            {dirty
              ? "Save the page list first."
              : `${1 + pages.length} page${pages.length ? "s" : ""}`}
          </p>
        </PanelSection>
      </PanelActions>
      {status && (
        <p
          role={status.ok ? "status" : "alert"}
          className={status.ok ? undefined : ui.error}
          style={status.ok ? { margin: "0 0 16px", color: "#2e7d32" } : { marginBottom: 16 }}
        >
          {status.message}
        </p>
      )}
      <section className={ui.card} aria-labelledby="site-pages" style={{ marginBottom: 16 }}>
        <h2 id="site-pages" className={ui.sectionHeading}>
          Pages to read
        </h2>
        <p className={ui.muted} style={{ marginTop: 0 }}>
          Always read: <code className={ui.code}>{siteUrl}</code>
        </p>
        <form
          className={ui.form}
          onSubmit={(e) => {
            e.preventDefault();
            savePages();
          }}
        >
          <div className={ui.field}>
            <label htmlFor="site-pages-input" className={ui.label}>
              Extra pages (optional)
            </label>
            <textarea
              id="site-pages-input"
              className={`${ui.input} ${ui.code}`}
              rows={4}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPagesStatus(null);
              }}
              placeholder={"/en/safety-information.html\n/en/faq.html"}
              spellCheck={false}
              aria-describedby="site-pages-hint"
            />
            <span id="site-pages-hint" className={ui.hint}>
              One path per line, on the same site, up to {MAX_SITE_PAGES}. Add pages that show
              components the main page doesn&apos;t, such as the ISI, a modal or an accordion.
            </span>
          </div>
          {pagesStatus && (
            <p
              role={pagesStatus.ok ? "status" : "alert"}
              className={pagesStatus.ok ? undefined : ui.error}
              style={pagesStatus.ok ? { margin: 0, color: "#2e7d32" } : undefined}
            >
              {pagesStatus.message}
            </p>
          )}
          <button type="submit" className={ui.button} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save pages"}
          </button>
        </form>
      </section>
    </>
  );
}

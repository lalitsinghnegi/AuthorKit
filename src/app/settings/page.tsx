import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { isEncryptionConfigured } from "@/lib/secrets/crypto";
import { ANTHROPIC_MODEL } from "@/lib/llm/anthropic";
import { isLLMConfigured } from "@/lib/llm/server";
import { effectivePatterns } from "@/lib/mapping";
import { getComponentPatterns, getFigmaStatus } from "@/lib/storage/settings";
import { PatternsCard } from "./PatternsCard";
import { SettingsView } from "./SettingsView";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Figma access and app-wide preferences." />
      <Suspense fallback={<p className={ui.muted}>Loading settings…</p>}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  await connection();
  const saved = await getComponentPatterns();
  return (
    <div className={ui.sections}>
      <SettingsView
        initialStatus={await getFigmaStatus()}
        keyConfigured={isEncryptionConfigured()}
      />
      <PatternsCard initial={effectivePatterns(saved)} customised={Boolean(saved)} />
      <section className={ui.card} aria-labelledby="ai-title">
        <h2 id="ai-title" className={ui.sectionHeading}>
          AI suggestions
        </h2>
        <p style={{ margin: 0 }}>
          {isLLMConfigured() ? (
            <>
              <strong>On</strong> ({ANTHROPIC_MODEL}). Used only when you ask, for frames whose
              names don&apos;t identify a component. Only frame names, positions and sizes are sent.
            </>
          ) : (
            <>
              <strong>Off.</strong> Add <code className={ui.code}>ANTHROPIC_API_KEY</code> to{" "}
              <code className={ui.code}>.env</code> and restart to let AI suggest mappings for
              ambiguous frames.
            </>
          )}
        </p>
      </section>
    </div>
  );
}

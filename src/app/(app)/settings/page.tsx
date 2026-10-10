import { Suspense } from "react";
import { connection } from "next/server";
import { AdminPage } from "@/components/AdminPage";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { isEncryptionConfigured } from "@/lib/secrets/crypto";
import { effectivePatterns } from "@/lib/mapping";
import { getComponentPatterns, getFigmaStatus } from "@/lib/storage/settings";
import { PatternsCard } from "./PatternsCard";
import { SettingsView } from "./SettingsView";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Figma access and app-wide preferences." />
      <Suspense fallback={<p className={ui.muted}>Loading settings…</p>}>
        <AdminPage>
          <Loader />
        </AdminPage>
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
    </div>
  );
}

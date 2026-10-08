import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { isEncryptionConfigured } from "@/lib/secrets/crypto";
import { getFigmaStatus } from "@/lib/storage/settings";
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
  return (
    <SettingsView initialStatus={await getFigmaStatus()} keyConfigured={isEncryptionConfigured()} />
  );
}

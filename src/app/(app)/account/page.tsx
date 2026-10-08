import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";
import { PasswordForm } from "./PasswordForm";

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Account" description="Your sign-in details." />
      <Suspense fallback={<p className={ui.muted}>Loading…</p>}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <div className={ui.sections}>
      <section className={ui.card} aria-labelledby="me-title">
        <h2 id="me-title" className={ui.sectionHeading}>
          {user.name}
        </h2>
        <p style={{ margin: 0 }}>
          {user.email} · {user.role === "admin" ? "Admin" : "Viewer (view only)"}
        </p>
      </section>
      <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
    </div>
  );
}

import { Suspense } from "react";
import { AdminPage } from "@/components/AdminPage";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { getCurrentUser } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/model";
import { listUsers } from "@/lib/storage/users";
import { UsersView } from "./UsersView";

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        description="Admins can change everything. Viewers can browse projects, preview packages and download them."
      />
      <Suspense fallback={<p className={ui.muted}>Loading users…</p>}>
        <AdminPage>
          <Loader />
        </AdminPage>
      </Suspense>
    </>
  );
}

async function Loader() {
  const [users, me] = await Promise.all([listUsers(), getCurrentUser()]);
  return (
    <UsersView
      users={users.map(toPublicUser)}
      currentUserId={me?.id ?? ""}
      minPasswordLength={MIN_PASSWORD_LENGTH}
    />
  );
}

import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import ui from "@/components/ui/ui.module.css";

/** Admin-only screens: viewers see a short explanation instead. Renders inside Suspense. */
export async function AdminPage({ children }: { children: React.ReactNode }) {
  if (isAdmin(await getCurrentUser())) return children;
  return (
    <p className={ui.card} role="note">
      Only admins can open this screen. Ask an admin if you need a change here.
    </p>
  );
}

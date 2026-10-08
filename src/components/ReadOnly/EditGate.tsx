import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { ReadOnlyProvider } from "./ReadOnlyContext";
import styles from "./ReadOnly.module.css";

/**
 * Editing UI for admins. Viewers see the same screen with every control
 * disabled (a disabled fieldset, plus the context for portaled panel actions)
 * and a "View only" note. The server actions refuse viewers regardless.
 * Renders inside a Suspense boundary because it reads the session.
 */
export async function EditGate({ children }: { children: React.ReactNode }) {
  if (isAdmin(await getCurrentUser())) return children;
  return (
    <ReadOnlyProvider>
      <p className={styles.note} role="note">
        <strong>View only.</strong> Ask an admin to make changes.
      </p>
      <fieldset disabled className={styles.fieldset}>
        {children}
      </fieldset>
    </ReadOnlyProvider>
  );
}

/** Render only for admins (e.g. destructive panel actions). */
export async function AdminOnly({ children }: { children: React.ReactNode }) {
  return isAdmin(await getCurrentUser()) ? children : null;
}

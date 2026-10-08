import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/auth/session";
import styles from "./AppShell.module.css";

/** Who is signed in, their role, and sign-out. Reads the session, so it renders inside Suspense. */
export async function AccountBox() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className={styles.account}>
      <div className={styles.accountName} title={user.email}>
        {user.name}
      </div>
      <div className={styles.accountMeta}>
        <span className={styles.roleBadge} data-role={user.role}>
          {user.role === "admin" ? "Admin" : "View only"}
        </span>
        <Link href="/account" className={styles.accountLink}>
          Account
        </Link>
      </div>
      <form action={logoutAction}>
        <button type="submit" className={styles.signOut}>
          Sign out
        </button>
      </form>
    </div>
  );
}

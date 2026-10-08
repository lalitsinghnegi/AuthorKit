import styles from "./auth.module.css";

/** Sign-in pages: a centered card, no app navigation. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>AuthorKit</div>
        {children}
      </div>
    </main>
  );
}

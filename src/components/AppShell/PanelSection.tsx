import styles from "./AppShell.module.css";

/** A titled group of context actions in the left panel. */
export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function PanelButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={styles.panelButton} {...props} />;
}

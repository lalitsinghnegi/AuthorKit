import Link from "next/link";
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

export function PanelButton({
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "secondary" | "danger" }) {
  return <button type="button" className={styles.panelButton} data-variant={variant} {...props} />;
}

export function PanelLink({
  variant,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: "secondary" }) {
  return <Link className={styles.panelButton} data-variant={variant} {...props} />;
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className={styles.panelNote}>{children}</p>;
}

/** Plain anchor for file downloads; next/link would attempt a client-side navigation. */
export function PanelDownload({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} download className={styles.panelButton} data-variant="secondary">
      {children}
    </a>
  );
}

/** Plain anchor that opens in a new tab (e.g. a standalone page served by an API route). */
export function PanelExternal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.panelButton}
      data-variant="secondary"
    >
      {children}
    </a>
  );
}

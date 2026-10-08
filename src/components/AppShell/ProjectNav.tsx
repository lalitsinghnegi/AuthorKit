"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppShell.module.css";

/** Sub-navigation for one project. */
export function ProjectNav({ id, name }: { id: string; name: string }) {
  const pathname = usePathname();
  const base = `/projects/${id}`;
  const items = [
    { href: base, label: "Overview" },
    { href: `${base}/breakpoints`, label: "Breakpoints" },
    { href: `${base}/scaffold`, label: "Scaffold" },
    { href: `${base}/figma`, label: "Figma" },
    { href: `${base}/tokens`, label: "Tokens" },
    { href: `${base}/generate`, label: "Generate" },
  ];

  return (
    <nav aria-label={`Project: ${name}`} className={styles.section}>
      <h2 className={styles.sectionTitle} title={name}>
        {name}
      </h2>
      <ul className={styles.subNav}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.navLink}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type NavItem = { href: string; label: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/projects", label: "Projects" },
  { href: "/templates", label: "Templates" },
  { href: "/settings", label: "Settings" },
];

/** A nav item is active on its own path and on any nested path below it. */
export function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type ManagedNavHref =
  | "/"
  | "/sessions"
  | "/review"
  | "/gateway"
  | "/automations"
  | "/skills"
  | "/memory"
  | "/connections"
  | "/audit"
  | "/team"
  | "/usage"
  | "/settings"
  | "/profile";

export type ManagedNavItem = {
  readonly href: ManagedNavHref;
  readonly label: string;
  readonly badge?: number;
  readonly implemented: boolean;
};

export const MANAGED_PRIMARY_NAV: readonly ManagedNavItem[] = [
  { href: "/", label: "Home", implemented: true },
  { href: "/sessions", label: "Sessions", implemented: true },
  { href: "/review", label: "Review", badge: 4, implemented: true },
  { href: "/gateway", label: "Gateway", implemented: true },
  { href: "/automations", label: "Automations", implemented: true },
  { href: "/skills", label: "Skills", implemented: true },
  { href: "/memory", label: "Memory & documents", implemented: true },
];

export const MANAGED_SECONDARY_NAV: readonly ManagedNavItem[] = [
  { href: "/connections", label: "Connections & keys", implemented: true },
  { href: "/audit", label: "Audit", implemented: true },
  { href: "/team", label: "Team", implemented: true },
  { href: "/usage", label: "Usage & billing", implemented: true },
  { href: "/settings", label: "Settings", implemented: true },
];

export function isManagedNavActive(pathname: string, href: ManagedNavHref): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

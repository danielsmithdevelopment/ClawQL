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
  | "/console/audit"
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
  // Page lives at `/console/audit`; `/audit` is the JSON witness API (middleware
  // still rewrites document GETs). Nav must not Link-prefetch `/audit` or the
  // route handler 404s in the browser console when the E2E harness is off.
  { href: "/console/audit", label: "Audit", implemented: true },
  { href: "/team", label: "Team", implemented: true },
  { href: "/usage", label: "Usage & billing", implemented: true },
  { href: "/settings", label: "Settings", implemented: true },
];

export function isManagedNavActive(pathname: string, href: ManagedNavHref): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/console/audit" || href === "/audit") {
    return pathname === "/audit" || pathname === "/console/audit" || pathname.startsWith("/console/audit/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

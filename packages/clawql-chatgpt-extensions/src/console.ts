/** Six-section ClawQL console (global entrypoint). */

export const CONSOLE_SECTIONS = [
  { id: "overview", title: "Overview", scope: "user" as const },
  { id: "memory", title: "Memory", scope: "user" as const },
  { id: "documents", title: "Documents", scope: "user" as const },
  { id: "activity", title: "Activity", scope: "user" as const },
  { id: "sources", title: "Sources", scope: "user" as const },
  { id: "admin", title: "Admin", scope: "admin" as const },
] as const;

export type ConsoleSectionId = (typeof CONSOLE_SECTIONS)[number]["id"];

export function sectionsForUser(opts: {
  readonly isAdmin: boolean;
}): (typeof CONSOLE_SECTIONS)[number][] {
  return CONSOLE_SECTIONS.filter((s) => s.scope === "user" || opts.isAdmin);
}

export function resolveConsoleDeepLink(path: string | undefined): {
  readonly section: ConsoleSectionId;
  readonly resourceId?: string;
} {
  const raw = (path ?? "overview").replace(/^\//, "");
  const [sectionRaw, resourceId] = raw.split("/");
  const section = CONSOLE_SECTIONS.some((s) => s.id === sectionRaw)
    ? (sectionRaw as ConsoleSectionId)
    : "overview";
  return { section, resourceId: resourceId || undefined };
}

/** Deep link carried by MCP Events payloads. */
export function consoleUrlForAuditEntry(entryId: string): string {
  return `clawql_console?path=activity/${encodeURIComponent(entryId)}`;
}

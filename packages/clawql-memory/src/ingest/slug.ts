/** Slug for vault filenames and slug→path index (same rules as memory_ingest). */
export function slugifyTitle(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
  return s || "note";
}

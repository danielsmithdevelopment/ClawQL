/**
 * Shared Markdown helpers for vault-backed memory tools.
 */

/** Strip YAML frontmatter (Obsidian-style) when present. */
export function stripVaultFrontmatter(s: string): string {
  if (s.startsWith("---\n")) {
    const end = s.indexOf("\n---\n", 4);
    if (end !== -1) return s.slice(end + 5).trim();
  }
  return s;
}

/** Obsidian `[[note|alias]]` uses the left side as target. */
export function extractWikilinkTargets(markdown: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < markdown.length) {
    const start = markdown.indexOf("[[", i);
    if (start === -1) break;
    const end = markdown.indexOf("]]", start + 2);
    if (end === -1) break;
    const raw = markdown.slice(start + 2, end).split("|")[0]?.trim();
    if (raw) out.push(raw);
    i = end + 2;
  }
  return out;
}

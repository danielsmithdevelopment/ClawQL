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
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const raw = m[1].split("|")[0]?.trim();
    if (raw) out.push(raw);
  }
  return out;
}
